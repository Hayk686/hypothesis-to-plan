# Telegram Chat Bot via PicoClaw

Чат-бот в Telegram. Внутри — PicoClaw как conversational runtime, OpenRouter `openai/gpt-oss-120b:free` как модель.

## Установка и запуск

1. **Скачайте агент:** Исполняемый файл не хранится в Git. Скачайте `picoclaw.exe` и поместите его в папку `tools/picoclaw/picoclaw.exe` (или запустите `.\scripts\setup_picoclaw_windows.ps1`, если он у вас есть).

2. **Запустите шлюз:**
```powershell
.\scripts\start_picoclaw_gateway.ps1
```

Скрипт стартует `tools/picoclaw/picoclaw.exe gateway` с конфигом `picoclaw/config.local.json`. Бот начинает принимать сообщения в Telegram через long-polling.

Остановить — `Ctrl+C` в окне или `Stop-Process -Name picoclaw`.

## Конфигурация

- **Модель** — `picoclaw/config.local.json`, поле `model_list[0].model`. Сейчас: `openai/gpt-oss-120b:free` (OpenRouter).
- **API-ключ OpenRouter** — `picoclaw/openrouter_api_key.txt` (привязан к модели через `picoclaw/.security.yml`).
- **Telegram-токен** — `picoclaw/config.local.json`, поле `channel_list.telegram.settings.token`.
- **Персона / правила ответов** — `picoclaw/AGENTS.md`. Менять её — менять поведение бота.
- **Gateway** — `picoclaw/config.local.json`, секция `gateway`. Сейчас `127.0.0.1:18790`.

## Возможности

- **Чат.** Бот отвечает на языке пользователя (RU / HY / EN), коротко, одной репликой. Правила — в `picoclaw/AGENTS.md`.
- **Скачивание аудио.** На запрос пользователя бот вызывает `python scripts\converter.py download --url <URL> --items <RANGE> --format <FORMAT>` (обёртка над `yt-dlp` + `ffmpeg`). Прямой запуск `yt-dlp` заблокирован в `config.local.json` (`tools.exec.custom_deny_patterns`). Файлы сохраняются в `output\media\`.

## Структура

```
.gitignore
requirements.txt
picoclaw/                    конфиг и персона
  AGENTS.md                  системный промпт
  TOOLS.md                   планируемые Excel-команды (на будущее)
  config.local.json          модель, токены, gateway-порт
  .security.yml              маппинг ключей к моделям
  openrouter_api_key.txt
  workspace/                 внутреннее состояние PicoClaw
tools/picoclaw/
  picoclaw.exe               сам бинарь
scripts/
  start_picoclaw_gateway.ps1 запуск gateway
  converter.py               скачивание / конвертация аудио (yt-dlp + ffmpeg)
  check.ps1                  проверка окружения
input/                       пользовательские файлы (вход для будущих инструментов)
output/                      создаётся при первом скачивании в output/media/
```

## Дальше

Сейчас бот — собеседник + скачивание аудио. Позже превратится в помощника по бизнесу для розничного магазина в Армении (Excel / CSV анализ, остатки, маржа). Заготовка команд — в `picoclaw/TOOLS.md`.
