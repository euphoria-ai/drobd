"""Thin shared wrapper around the Groq SDK."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from groq import AsyncGroq

from ..config import get_settings

# The current Groq vision model has a thinking mode. Even with JSON mode on, a
# leading reasoning block can survive into the content, so strip it before
# parsing rather than letting json.loads fail.
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


class GroqUnavailable(RuntimeError):
    """No API key configured, or the API could not be reached."""


@lru_cache(maxsize=1)
def get_client() -> AsyncGroq:
    settings = get_settings()
    if not settings.groq_api_key:
        raise GroqUnavailable("GROQ_API_KEY is not set")
    return AsyncGroq(api_key=settings.groq_api_key, timeout=settings.request_timeout_s)


def parse_json_content(content: str | None) -> dict[str, Any]:
    """Pull a JSON object out of a model response.

    Tolerates a thinking block and prose either side of the object, because a
    failed parse here costs the user their capture.
    """
    if not content:
        raise ValueError("empty response from model")

    cleaned = _THINK_BLOCK.sub("", content).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = _JSON_OBJECT.search(cleaned)
        if not match:
            raise ValueError(f"no JSON object in response: {cleaned[:200]!r}") from None
        return json.loads(match.group(0))
