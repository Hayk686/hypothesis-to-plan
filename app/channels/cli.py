from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.config import load_config
from app.core.agent import AgentCore
from app.core.task_log import TaskLogger
from app.core.types import Attachment, IncomingMessage
from app.logging_jsonl import JsonlLogger


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(description="Local CLI adapter for the agent core")
    parser.add_argument("text", nargs="*", help="Message text")
    parser.add_argument("--file", action="append", default=[], help="Attach a local file path")
    parser.add_argument("--cleanup", action="store_true", help="Delete cleanup files after printing the result")
    args = parser.parse_args()

    config = load_config()
    core = AgentCore(config.root, task_log=TaskLogger(JsonlLogger(config.logs_dir / "tasks.jsonl")), config=config)
    attachments = [
        Attachment(path=Path(item).resolve(), filename=Path(item).name, kind="document")
        for item in args.file
    ]
    message = IncomingMessage(
        text=" ".join(args.text).strip(),
        attachments=attachments,
        channel="cli",
    )
    outgoing = core.handle(message)

    if outgoing.text:
        print(outgoing.text)
    for path in outgoing.files:
        print(f"FILE {path}")

    if args.cleanup:
        for path in outgoing.cleanup_files:
            try:
                target = path.resolve()
                if target.exists() and target.is_file() and config.output_dir.resolve() in target.parents:
                    target.unlink()
                    print(f"DELETED {target}")
            except Exception as exc:
                print(f"DELETE_FAILED {path}: {exc}")


if __name__ == "__main__":
    main()
