from __future__ import annotations

import json
import mimetypes
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from app.config import RuntimeConfig, load_config
from app.core.agent import AgentCore
from app.core.command_registry import first_command_token
from app.core.planner import plan_workflow
from app.core.router import plan_text_route
from app.core.task_log import TaskLogger
from app.core.types import Attachment, IncomingMessage, Outgoing
from app.logging_jsonl import JsonlLogger


class TelegramClient:
    def __init__(self, token: str):
        self.token = token
        self.api = f"https://api.telegram.org/bot{token}"
        self.file_api = f"https://api.telegram.org/file/bot{token}"

    def call(self, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = urllib.parse.urlencode(payload or {}).encode("utf-8")
        request = urllib.request.Request(f"{self.api}/{method}", data=data)
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))

    def get_updates(self, offset: int | None) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"timeout": 45, "allowed_updates": json.dumps(["message"])}
        if offset is not None:
            payload["offset"] = offset
        result = self.call("getUpdates", payload)
        return result.get("result", [])

    def send_message(self, chat_id: int, text: str) -> dict[str, Any] | None:
        if not text:
            return None
        return self.call("sendMessage", {"chat_id": chat_id, "text": text[:3900]})

    def edit_message_text(self, chat_id: int, message_id: int, text: str) -> dict[str, Any]:
        return self.call(
            "editMessageText",
            {"chat_id": chat_id, "message_id": message_id, "text": text[:3900]},
        )

    def send_chat_action(self, chat_id: int, action: str) -> dict[str, Any]:
        return self.call("sendChatAction", {"chat_id": chat_id, "action": action})

    def delete_commands(self) -> None:
        self.call("deleteMyCommands", {})

    def set_commands(self, commands: list[dict[str, str]]) -> None:
        self.call("setMyCommands", {"commands": json.dumps(commands, ensure_ascii=False)})

    def send_file(self, chat_id: int, path: Path, caption: str = "") -> dict[str, Any]:
        method, field = self._file_method(path)
        fields = {"chat_id": str(chat_id)}
        if caption:
            fields["caption"] = caption[:900]
        return self._multipart(method, fields, field, path)

    def delete_message(self, chat_id: int, message_id: int) -> dict[str, Any]:
        return self.call("deleteMessage", {"chat_id": chat_id, "message_id": message_id})

    def delete_messages(self, chat_id: int, message_ids: list[int]) -> dict[str, Any]:
        return self.call(
            "deleteMessages",
            {"chat_id": chat_id, "message_ids": json.dumps(message_ids)},
        )

    def get_file_path(self, file_id: str) -> str:
        result = self.call("getFile", {"file_id": file_id})
        return result["result"]["file_path"]

    def download_file(self, file_path: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        url = f"{self.file_api}/{file_path}"
        with urllib.request.urlopen(url, timeout=120) as response:
            destination.write_bytes(response.read())

    def _file_method(self, path: Path) -> tuple[str, str]:
        if path.suffix.lower() in {".mp3", ".m4a", ".wav", ".flac", ".opus", ".ogg", ".aac"}:
            return "sendAudio", "audio"
        return "sendDocument", "document"

    def _multipart(self, method: str, fields: dict[str, str], file_field: str, path: Path) -> dict[str, Any]:
        boundary = f"----agent-runtime-{uuid.uuid4().hex}"
        body = bytearray()

        for name, value in fields.items():
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            body.extend(str(value).encode("utf-8"))
            body.extend(b"\r\n")

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{file_field}"; filename="{path.name}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
        )
        body.extend(path.read_bytes())
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode("utf-8"))

        request = urllib.request.Request(
            f"{self.api}/{method}",
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.loads(response.read().decode("utf-8"))


class TelegramRuntime:
    def __init__(self, config: RuntimeConfig):
        self.config = config
        self.client = TelegramClient(config.telegram_token)
        self.log = JsonlLogger(config.logs_dir / "events.jsonl")
        self.task_log = TaskLogger(JsonlLogger(config.logs_dir / "tasks.jsonl"))
        self.core = AgentCore(config.root, task_log=self.task_log, config=config)
        self.offset_path = config.state_dir / "telegram_offset.json"
        self.config.state_dir.mkdir(parents=True, exist_ok=True)
        self.config.input_dir.mkdir(parents=True, exist_ok=True)
        self.pending_path = config.state_dir / "telegram_pending_commands.json"
        self.pending_commands = self._load_pending_commands()
        self.history_path = config.state_dir / "telegram_message_history.json"
        self.message_history = self._load_message_history()

    def run_forever(self) -> None:
        self._sync_commands()
        self.log.event("runtime_started")
        while True:
            try:
                self.poll_once()
            except KeyboardInterrupt:
                self.log.event("runtime_stopped")
                raise
            except Exception as exc:
                self.log.exception("runtime_error", exc)
                time.sleep(5)

    def _sync_commands(self) -> None:
        commands = self.core.commands.menu_commands()
        try:
            self.client.set_commands(commands)
            self.log.event("commands_synced", commands=[item["command"] for item in commands])
        except Exception as exc:
            self.log.exception("commands_sync_failed", exc)

    def poll_once(self) -> None:
        offset = self._load_offset()
        updates = self.client.get_updates(offset)
        for update in updates:
            self._save_offset(update["update_id"] + 1)
            self.handle_update(update)

    def handle_update(self, update: dict[str, Any]) -> None:
        message = update.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if chat_id is None:
            return

        text = message.get("text") or message.get("caption") or ""
        message_id = message.get("message_id")
        if isinstance(message_id, int):
            self._remember_message(chat_id, message_id)
        self.log.event("message_received", chat_id=chat_id, text=text, has_document=bool(message.get("document")))

        thought_message_id = self._send_thought_message(chat_id, message, text)
        if message.get("document"):
            outgoing = self._handle_document(message, text)
        else:
            outgoing = self._handle_text_message(chat_id, message, text)

        self._deliver(chat_id, outgoing, thought_message_id)

    def _handle_text_message(self, chat_id: int, message: dict[str, Any], text: str) -> Outgoing:
        command = first_command_token(text)

        if command == "cancel":
            had_pending = self._pop_pending_command(chat_id)
            if had_pending:
                return Outgoing(text="Ок, отменил ожидание команды.")
            return self.core.handle(self._incoming(chat_id, message, text))

        if command == "clear":
            self._pop_pending_command(chat_id)
            self.core.clear_memory("telegram", chat_id)
            self._clear_chat(chat_id)
            return Outgoing()

        followup_spec = self.core.commands.followup_spec(text)
        if followup_spec:
            self._set_pending_command(chat_id, followup_spec.name)
            prompt = followup_spec.input_prompt or f"Пришли данные для /{followup_spec.name}."
            return Outgoing(text=prompt)

        if command:
            self._pop_pending_command(chat_id)
            return self.core.handle(self._incoming(chat_id, message, text))

        pending = self._pop_pending_command(chat_id)
        if pending:
            return self.core.handle(self._incoming(chat_id, message, f"/{pending} {text}"))

        return self.core.handle(self._incoming(chat_id, message, text))

    def _incoming(self, chat_id: int, message: dict[str, Any], text: str) -> IncomingMessage:
        return IncomingMessage(
            text=text,
            channel="telegram",
            chat_id=chat_id,
            raw=message,
        )

    def _send_thought_message(self, chat_id: int, message: dict[str, Any], text: str) -> int | None:
        thought = self._thought_text(chat_id, message, text)
        if not thought:
            return None

        try:
            self.client.send_chat_action(chat_id, "typing")
        except Exception as exc:
            self.log.exception("chat_action_failed", exc, chat_id=chat_id)

        try:
            result = self.client.send_message(chat_id, thought)
            self._remember_sent_result(chat_id, result)
            message_id = sent_message_id(result)
            self.log.event("thought_message_sent", chat_id=chat_id, message_id=message_id, text=thought)
            return message_id
        except Exception as exc:
            self.log.exception("thought_message_failed", exc, chat_id=chat_id, text=thought)
            return None

    def _thought_text(self, chat_id: int, message: dict[str, Any], text: str) -> str:
        if message.get("document"):
            return "Обрабатываю файл..."

        command = first_command_token(text)
        if command in {"help", "start", "status", "tools", "ping", "cancel", "clear", "artifacts", "last", "use", "tasks", "roles"}:
            return ""
        if command == "resume":
            return "Продолжаю последнюю остановленную задачу..."
        if self.core.commands.followup_spec(text):
            return ""
        if command and not self.core.commands.match(text):
            return ""

        pending = self.pending_commands.get(str(chat_id), "")
        action = command or pending
        if not action:
            if plan_workflow(text):
                return "Планирую шаги..."
            plan = plan_text_route(text)
            action = {
                "download_audio": "dl",
                "research": "research",
                "fetch": "fetch",
            }.get(plan.action, "")
        if action == "dl":
            return "Скачиваю и готовлю файл..."
        if action == "search":
            return "Ищу в интернете..."
        if action == "fetch":
            return "Читаю страницу..."
        if action == "research":
            return "Ищу источники и собираю ответ..."
        if action == "model":
            return "Смотрю доступные модели..."
        if action == "roles":
            return ""
        return "Думаю..."

    def _handle_document(self, message: dict[str, Any], caption: str) -> Outgoing:
        document = message["document"]
        file_name = document.get("file_name") or f"telegram_file_{document['file_id']}"
        saved_path = self.config.input_dir / f"{uuid.uuid4().hex}_{file_name}"
        file_path = self.client.get_file_path(document["file_id"])
        try:
            self.client.download_file(file_path, saved_path)
            self.log.event("document_downloaded", file_name=file_name, path=str(saved_path))
            attachment = Attachment(
                path=saved_path,
                filename=file_name,
                content_type=document.get("mime_type", ""),
                kind="document",
            )
            return self.core.handle(
                IncomingMessage(
                    text=caption,
                    attachments=[attachment],
                    channel="telegram",
                    chat_id=(message.get("chat") or {}).get("id"),
                    raw=message,
                )
            )
        finally:
            try:
                if saved_path.exists():
                    saved_path.unlink()
                    self.log.event("document_deleted", file_name=file_name, path=str(saved_path))
            except Exception as exc:
                self.log.exception("document_delete_failed", exc, file_name=file_name, path=str(saved_path))

    def _deliver(self, chat_id: int, outgoing: Outgoing, thought_message_id: int | None = None) -> None:
        if thought_message_id and outgoing.text and not outgoing.files:
            try:
                self.client.edit_message_text(chat_id, thought_message_id, outgoing.text)
                self.log.event("thought_message_edited", chat_id=chat_id, message_id=thought_message_id)
                return
            except Exception as exc:
                self.log.exception("thought_message_edit_failed", exc, chat_id=chat_id, message_id=thought_message_id)

        if thought_message_id:
            try:
                self.client.delete_message(chat_id, thought_message_id)
                self.log.event("thought_message_deleted", chat_id=chat_id, message_id=thought_message_id)
            except Exception as exc:
                self.log.exception("thought_message_delete_failed", exc, chat_id=chat_id, message_id=thought_message_id)

        if outgoing.text and not outgoing.files:
            result = self.client.send_message(chat_id, outgoing.text)
            self._remember_sent_result(chat_id, result)
            self.log.event("message_sent", chat_id=chat_id, text=outgoing.text)

        for path in outgoing.files:
            result = self.client.send_file(chat_id, path, outgoing.text)
            self._remember_sent_result(chat_id, result)
            self.log.event("file_sent", chat_id=chat_id, path=str(path))

        if outgoing.cleanup_files:
            self._cleanup_sent_files(outgoing.cleanup_files)

        if outgoing.text and outgoing.files:
            return

    def _cleanup_sent_files(self, files: list[Path]) -> None:
        output_root = self.config.output_dir.resolve()
        seen = set()

        for path in files:
            try:
                target = path.resolve()
            except Exception:
                target = path

            marker = str(target).lower()
            if marker in seen:
                continue
            seen.add(marker)

            try:
                if not target.exists():
                    continue
                if not target.is_file():
                    continue
                if output_root not in target.parents:
                    self.log.event("cleanup_skipped_outside_output", path=str(target))
                    continue

                target.unlink()
                self.log.event("sent_file_deleted", path=str(target))
            except Exception as exc:
                self.log.exception("sent_file_delete_failed", exc, path=str(target))

    def _remember_sent_result(self, chat_id: int, result: dict[str, Any] | None) -> None:
        if not result:
            return
        message = result.get("result")
        if not isinstance(message, dict):
            return
        message_id = message.get("message_id")
        if isinstance(message_id, int):
            self._remember_message(chat_id, message_id)

    def _clear_chat(self, chat_id: int) -> None:
        message_ids = self._message_ids(chat_id)
        self._forget_message_history(chat_id)

        if not message_ids:
            self.log.event("chat_clear_no_history", chat_id=chat_id)
            return

        failed = 0
        for chunk in chunks(sorted(message_ids, reverse=True), 100):
            try:
                self.client.delete_messages(chat_id, chunk)
                continue
            except Exception as exc:
                self.log.exception("chat_clear_bulk_failed", exc, chat_id=chat_id, count=len(chunk))

            for message_id in chunk:
                try:
                    self.client.delete_message(chat_id, message_id)
                except Exception as exc:
                    failed += 1
                    self.log.exception(
                        "chat_clear_message_failed",
                        exc,
                        chat_id=chat_id,
                        message_id=message_id,
                    )

        self.log.event("chat_clear_finished", chat_id=chat_id, attempted=len(message_ids), failed=failed)

    def _message_ids(self, chat_id: int) -> list[int]:
        values = self.message_history.get(str(chat_id), [])
        ids = []
        seen = set()
        for value in values:
            try:
                message_id = int(value)
            except (TypeError, ValueError):
                continue
            if message_id in seen:
                continue
            ids.append(message_id)
            seen.add(message_id)
        return ids

    def _remember_message(self, chat_id: int, message_id: int) -> None:
        key = str(chat_id)
        history = self.message_history.setdefault(key, [])
        if message_id in history:
            return
        history.append(message_id)
        if len(history) > 500:
            del history[:-500]
        self._save_message_history()

    def _forget_message_history(self, chat_id: int) -> None:
        if self.message_history.pop(str(chat_id), None) is not None:
            self._save_message_history()

    def _load_message_history(self) -> dict[str, list[int]]:
        if not self.history_path.exists():
            return {}
        try:
            data = json.loads(self.history_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if not isinstance(data, dict):
            return {}

        cleaned: dict[str, list[int]] = {}
        for chat_id, values in data.items():
            if not isinstance(values, list):
                continue
            ids = []
            for value in values[-500:]:
                try:
                    ids.append(int(value))
                except (TypeError, ValueError):
                    continue
            if ids:
                cleaned[str(chat_id)] = ids
        return cleaned

    def _save_message_history(self) -> None:
        self.history_path.write_text(
            json.dumps(self.message_history, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _load_offset(self) -> int | None:
        if not self.offset_path.exists():
            return None
        try:
            return json.loads(self.offset_path.read_text(encoding="utf-8")).get("offset")
        except Exception:
            return None

    def _save_offset(self, offset: int) -> None:
        self.offset_path.write_text(json.dumps({"offset": offset}), encoding="utf-8")

    def _load_pending_commands(self) -> dict[str, str]:
        if not self.pending_path.exists():
            return {}
        try:
            data = json.loads(self.pending_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if not isinstance(data, dict):
            return {}
        return {str(chat_id): str(command) for chat_id, command in data.items() if command}

    def _save_pending_commands(self) -> None:
        self.pending_path.write_text(
            json.dumps(self.pending_commands, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _set_pending_command(self, chat_id: int, command: str) -> None:
        self.pending_commands[str(chat_id)] = command
        self._save_pending_commands()
        self.log.event("pending_command_set", chat_id=chat_id, command=command)

    def _pop_pending_command(self, chat_id: int) -> str:
        command = self.pending_commands.pop(str(chat_id), "")
        if command:
            self._save_pending_commands()
            self.log.event("pending_command_cleared", chat_id=chat_id, command=command)
        return command


def chunks(values: list[int], size: int) -> list[list[int]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def sent_message_id(result: dict[str, Any] | None) -> int | None:
    if not result:
        return None
    message = result.get("result")
    if not isinstance(message, dict):
        return None
    message_id = message.get("message_id")
    return message_id if isinstance(message_id, int) else None


def main() -> None:
    TelegramRuntime(load_config()).run_forever()


if __name__ == "__main__":
    main()
