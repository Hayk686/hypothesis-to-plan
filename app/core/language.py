from __future__ import annotations

import re


ARMENIAN_RE = re.compile(r"[\u0530-\u058f]")
CYRILLIC_RE = re.compile(r"[\u0400-\u04ff]")
LATIN_RE = re.compile(r"[A-Za-z]")


def language_instruction(text: str) -> str:
    target = detect_target_language(text)
    if target == "armenian":
        return (
            "\n\nLanguage rule: The user explicitly needs Armenian or is writing in Armenian. "
            "Write the entire final answer in Armenian only. Do not use Russian, English, "
            "or transliterated filler. Keep foreign proper nouns, brand names, model names, "
            "URLs, file names, command names, and code identifiers unchanged when necessary. "
            "If an English or Russian technical term appears, either translate it to Armenian "
            "or put the original term in parentheses only when it is essential."
        )
    if target == "russian":
        return (
            "\n\nLanguage rule: The user explicitly needs Russian or is writing in Russian. "
            "Write the entire final answer in Russian only. Do not use Armenian, English, "
            "or transliterated filler. Keep foreign proper nouns, brand names, model names, "
            "URLs, commands, and code identifiers unchanged only when necessary."
        )
    if target == "english":
        return (
            "\n\nLanguage rule: Write the final answer in English. Keep brand names, model names, "
            "URLs, commands, and code identifiers unchanged when necessary."
        )
    return (
        "\n\nLanguage rule: Match the user's language. If the user mixes languages, answer in "
        "the language they explicitly requested; otherwise use the dominant language."
    )


def detect_target_language(text: str) -> str:
    lowered = text.lower()

    if explicit_armenian_request(lowered):
        return "armenian"
    if explicit_russian_request(lowered):
        return "russian"
    if explicit_english_request(lowered):
        return "english"

    if ARMENIAN_RE.search(text):
        return "armenian"
    if CYRILLIC_RE.search(text):
        return "russian"
    if LATIN_RE.search(text):
        return "english"
    return "auto"


def explicit_armenian_request(text: str) -> bool:
    markers = (
        "на армянском",
        "по армянски",
        "по-армянски",
        "армянском языке",
        "полностью на армянском",
        "только армян",
        "հայերեն",
        "միայն հայերեն",
        "ամբողջությամբ հայերեն",
        "armenian",
        "in armenian",
    )
    return any(marker in text for marker in markers)


def explicit_russian_request(text: str) -> bool:
    markers = (
        "на русском",
        "по русски",
        "по-русски",
        "русском языке",
        "только русский",
        "russian",
        "in russian",
    )
    return any(marker in text for marker in markers)


def explicit_english_request(text: str) -> bool:
    markers = (
        "на английском",
        "по английски",
        "по-английски",
        "английском языке",
        "только english",
        "english",
        "in english",
    )
    return any(marker in text for marker in markers)


def with_language_instruction(system_prompt: str, user_text: str) -> str:
    return system_prompt.rstrip() + language_instruction(user_text)
