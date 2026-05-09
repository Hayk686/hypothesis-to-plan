# Tools

Currently, the primary tool available to the agent is the media downloader script. Excel functionality is planned for the future and is not yet implemented.

## Media Downloader

The agent can download media using the following safe local wrapper:

```powershell
python scripts\converter.py download --url <URL> --items <RANGE> --format <FORMAT>
```

Parameters:
- `--url` — the link the user provided (required)
- `--items` — item range: `1:10` = first 10, `1:5` = first 5, `3:3` = item 3 only. Default: `1:10`
- `--format` — audio format: `mp3`, `m4a`, `wav`, `flac`, `opus`. Default: `mp3`

Safety:
- Do not run `yt-dlp` directly.
- Do not download files to the project root. Files are saved to `output\media\`.
