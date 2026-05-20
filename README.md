# Local Telegram Agent Runtime

Новый локальный runtime для Telegram-агента. PicoClaw оставлен как legacy-конфиг и источник текущих токенов, но активная архитектура теперь своя: `core` + `tools` + `channels`.

## Запуск

Фоновый запуск Telegram runtime:

```powershell
.\scripts\start_runtime.ps1
```

Запуск в текущем окне:

```powershell
.\scripts\start_runtime.ps1 -Foreground
```

Проверка ядра без Telegram:

```powershell
.\scripts\runtime_cli.ps1 /status
.\scripts\runtime_cli.ps1 /help
.\scripts\runtime_cli.ps1 /search "Telegram Bot API latest"
.\scripts\runtime_cli.ps1 /ask "ответь одним словом: ping"
.\scripts\runtime_cli.ps1 /browser "https://example.com"
.\scripts\runtime_cli.ps1 --file input\example.pdf "сделай докс"
```

PicoClaw и новый runtime нельзя одновременно запускать на одном Telegram token: оба используют long-polling и будут перехватывать сообщения друг у друга.

## Команды

- `/help` - показать команды
- `/status` - проверить runtime, web и AI-конфиг
- `/tools` - показать подключенные tools
- `/dl <links> [items] [format]` - скачать аудио через `scripts\converter.py`
- `/search <query>` - поиск в интернете
- `/fetch <url>` - прочитать страницу
- `/browser <url>` - открыть страницу в headless browser и вернуть видимый текст/ссылки
- `/browser screenshot <url>` - открыть страницу и отправить screenshot
- `/ask <question>` - спросить ИИ без web-поиска
- `/research <query>` - web-поиск, чтение источников и краткий AI-вывод
- `/clear` - очистить сохраненное состояние чата и удалить запомненные Telegram-сообщения
- `/model` - показать/выбрать активную AI-модель

Model manager:

```text
/model
/model list all [filter]
/model list openrouter [filter]
/model list nvidia [filter]
/model set openrouter <model-id>
/model set nvidia <model-id>
/model reset
```

OpenRouter list фильтруется по бесплатным моделям из `/models`. NVIDIA NIM list показывает модели, доступные через `https://integrate.api.nvidia.com/v1/models`, если настроен `NVIDIA_API_KEY` или `picoclaw/nvidia_api_key.txt`.

Обычный текст без slash-команды отправляется в AI-чат. Если нужна свежая информация, лучше использовать `/research`.

Language layer добавляет к LLM-запросам строгую языковую инструкцию. Если пользователь просит ответ на армянском или пишет по-армянски, финальный ответ должен быть полностью на армянском; исключения только для брендов, моделей, URL, команд и кода.

В Telegram runtime показывает короткие статус-сообщения перед долгими действиями: `Думаю...`, `Ищу в интернете...`, `Скачиваю и готовлю файл...`. Это не внутренний chain-of-thought модели, а безопасный прогресс-статус. Если ответ текстовый, статус редактируется в финальный ответ; если результатом идет файл, статус удаляется перед отправкой файла.

Команды можно использовать в два шага. Например, сначала отправить:

```text
/research
```

Потом следующим сообщением:

```text
лучшие бесплатные модели OpenRouter сейчас
```

То же работает для `/search`, `/fetch`, `/ask` и `/dl`. Если передумал, отправь `/cancel`.

`/clear` стирает только те сообщения, id которых runtime успел запомнить. Telegram Bot API не дает боту скачать всю старую историю чата назад, поэтому сообщения до включения tracking могут остаться. Старые сообщения и сообщения без нужных прав тоже могут не удалиться.

## Файлы

Runtime не копит пользовательские файлы:

- входящие Telegram-вложения временно сохраняются в `input\telegram\` и удаляются после обработки;
- результаты из `output\` удаляются после успешной отправки в Telegram;
- файлы вне `output\` не удаляются автоматически.

Поддержанные document flows:

- DOC/DOCX -> PDF, если отправить документ с caption про PDF/ПДФ;
- PDF -> DOCX, если отправить PDF с caption про DOC/DOCX/Word/докс/ворд.

## Конфигурация

- Telegram token: env `TELEGRAM_BOT_TOKEN` или `picoclaw/config.local.json`.
- OpenRouter key: env `OPENROUTER_API_KEY` или `picoclaw/openrouter_api_key.txt`.
- OpenRouter base: env `OPENROUTER_API_BASE` или `picoclaw/config.local.json`.
- Model: env `OPENROUTER_MODEL` или `picoclaw/config.local.json`, default `openai/gpt-oss-120b:free`.

Секреты не коммитятся. `logs/`, `state/`, `input/telegram/` и `output/` игнорируются Git.

## Структура

```text
app/
  core/        channel-independent ядро, command registry, task log
  channels/    Telegram и CLI адаптеры
  tools/       download, documents, web, llm, tool registry
scripts/
  start_runtime.ps1
  runtime_cli.ps1
  converter.py
  convert_docx_to_pdf.ps1
  convert_pdf_to_docx.ps1
picoclaw/
  config.local.json
  openrouter_api_key.txt
```

## Следующие слои

- safety/permissions layer для опасных действий;
- richer browser/Chrome actions: click, fill, login/session profiles;
- memory/context layer;
- business tools для магазина: Excel/CSV, остатки, продажи, маржа.
