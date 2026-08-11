"""The shared Groq wrapper: client construction and JSON extraction."""

from __future__ import annotations

import pytest

from drobe.config import get_settings
from drobe.pipeline.groq_client import GroqUnavailable, get_client, parse_json_content


def test_get_client_requires_an_api_key(no_groq):
    with pytest.raises(GroqUnavailable):
        get_client()


def test_get_client_is_cached_when_configured(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    get_settings.cache_clear()
    get_client.cache_clear()

    assert get_client() is get_client()


def test_parse_plain_object():
    assert parse_json_content('{"a": 1}') == {"a": 1}


def test_parse_strips_a_thinking_block_case_insensitively():
    raw = '<THINK>reasoning</THINK> {"a": 1}'
    assert parse_json_content(raw) == {"a": 1}


def test_parse_recovers_an_object_embedded_in_prose():
    assert parse_json_content('sure: {"a": 1} done') == {"a": 1}


@pytest.mark.parametrize("content", ["", None, "not json at all"])
def test_parse_rejects_unusable_content(content):
    with pytest.raises(ValueError):
        parse_json_content(content)
