from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from app.core.artifacts import ArtifactStore
from app.core.command_registry import CommandRegistry, build_command_registry
from app.core.command_registry import first_command_token
from app.core.dialogue import DialogueStateStore
from app.core.memory import ChatMemoryStore, memory_key
from app.core.planner import TaskStateStore, run_planned_workflow
from app.core.router import route_document, route_text
from app.core.task_log import TaskLogger
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import IncomingMessage, Outgoing
from app.tools.registry import build_tool_registry


class AgentCore:
    def __init__(
        self,
        root: Path,
        registry: ToolRegistry | None = None,
        commands: CommandRegistry | None = None,
        task_log: TaskLogger | None = None,
        config=None,
    ):
        self.root = root
        self.registry = registry or build_tool_registry()
        self.commands = commands or build_command_registry()
        self.task_log = task_log
        self.config = config
        state_dir = getattr(config, "state_dir", root / "state" / "runtime")
        self.memory = ChatMemoryStore(state_dir)
        self.artifacts = ArtifactStore(state_dir)
        self.task_state = TaskStateStore(state_dir)
        self.dialogue = DialogueStateStore(state_dir)

    def handle(self, message: IncomingMessage) -> Outgoing:
        task_id = self.task_log.start(message) if self.task_log else ""
        key = self.memory.key_for(message)
        if first_command_token(message.text) == "clear":
            self.memory.clear(key)
            self.artifacts.clear(key)
            self.task_state.clear(key)
            self.dialogue.clear(key)

        memory_context = self.memory.context_for(key)
        dialogue = self.dialogue.resolve(key, message.text, memory_context=memory_context) if not message.attachments else None
        effective_text = dialogue.text if dialogue else message.text
        effective_message = replace(message, text=effective_text)
        context = ToolContext(
            root=self.root,
            task_id=task_id,
            logger=self.task_log,
            config=self.config,
            memory_context=memory_context,
            artifact_context=self.artifacts.context_for(key, effective_text),
            artifact_store=self.artifacts,
            artifact_key=key,
            task_state=self.task_state,
        )
        if dialogue and dialogue.changed:
            context.metadata["dialogue"] = {
                "changed": True,
                "reason": dialogue.reason,
                "original_text": message.text,
                "effective_text": effective_text,
                "state": dialogue.state or {},
            }
            if self.task_log:
                self.task_log.event(
                    "dialogue_resolved",
                    task_id=task_id,
                    reason=dialogue.reason,
                    original_text=message.text,
                    effective_text=effective_text,
                )

        try:
            if effective_message.attachments:
                outgoing = self._handle_attachments(effective_message, context)
            elif first_command_token(effective_text):
                outgoing = self.commands.run(effective_text, self.root, self.registry, context)
            else:
                outgoing = run_planned_workflow(self.root, effective_text, self.registry, context, self.commands)
                if outgoing is None:
                    outgoing = route_text(self.root, effective_text, self.registry, context, self.commands)
        except Exception as exc:
            if self.task_log:
                self.task_log.failed(task_id, exc)
            return Outgoing(text=f"Runtime error: {exc}")

        if self.task_log:
            self.task_log.finish(task_id, outgoing)
        route = context.metadata.get("route_action") or first_command_token(effective_text) or ("document" if message.attachments else "chat")
        self.dialogue.record_turn(key, message.text, effective_text, outgoing.text, route=route)
        self.artifacts.record_turn(key, message, outgoing, route=route, metadata=context.metadata)
        self.memory.record_turn(key, message, outgoing, route=route)
        return outgoing

    def clear_memory(self, channel: str = "telegram", chat_id=None) -> None:
        key = memory_key(channel, chat_id)
        self.memory.clear(key)
        self.artifacts.clear(key)
        self.task_state.clear(key)
        self.dialogue.clear(key)

    def _handle_attachments(self, message: IncomingMessage, context: ToolContext) -> Outgoing:
        text_parts = []
        files = []
        cleanup_files = []

        for attachment in message.attachments:
            outgoing = route_document(self.root, attachment.path, message.text, self.registry, context)
            if outgoing.text:
                text_parts.append(outgoing.text)
            files.extend(outgoing.files)
            cleanup_files.extend(outgoing.cleanup_files)

        return Outgoing(
            text="\n".join(text_parts),
            files=files,
            cleanup_files=cleanup_files,
        )
