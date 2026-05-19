from __future__ import annotations

from pathlib import Path

from app.core.artifacts import ArtifactStore
from app.core.command_registry import CommandRegistry, build_command_registry
from app.core.command_registry import first_command_token
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

    def handle(self, message: IncomingMessage) -> Outgoing:
        task_id = self.task_log.start(message) if self.task_log else ""
        key = self.memory.key_for(message)
        if first_command_token(message.text) == "clear":
            self.memory.clear(key)
            self.artifacts.clear(key)
            self.task_state.clear(key)
        context = ToolContext(
            root=self.root,
            task_id=task_id,
            logger=self.task_log,
            config=self.config,
            memory_context=self.memory.context_for(key),
            artifact_context=self.artifacts.context_for(key, message.text),
            artifact_store=self.artifacts,
            artifact_key=key,
            task_state=self.task_state,
        )

        try:
            if message.attachments:
                outgoing = self._handle_attachments(message, context)
            elif first_command_token(message.text):
                outgoing = self.commands.run(message.text, self.root, self.registry, context)
            else:
                outgoing = run_planned_workflow(self.root, message.text, self.registry, context, self.commands)
                if outgoing is None:
                    outgoing = route_text(self.root, message.text, self.registry, context, self.commands)
        except Exception as exc:
            if self.task_log:
                self.task_log.failed(task_id, exc)
            return Outgoing(text=f"Runtime error: {exc}")

        if self.task_log:
            self.task_log.finish(task_id, outgoing)
        route = context.metadata.get("route_action") or first_command_token(message.text) or ("document" if message.attachments else "chat")
        self.artifacts.record_turn(key, message, outgoing, route=route, metadata=context.metadata)
        self.memory.record_turn(key, message, outgoing, route=route)
        return outgoing

    def clear_memory(self, channel: str = "telegram", chat_id=None) -> None:
        key = memory_key(channel, chat_id)
        self.memory.clear(key)
        self.artifacts.clear(key)
        self.task_state.clear(key)

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
