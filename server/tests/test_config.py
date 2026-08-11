"""Settings loading, defaults, and env overrides."""

from __future__ import annotations

from drobe.config import Settings, get_settings


def test_defaults_match_the_documented_values(monkeypatch):
    for var in (
        "GROQ_API_KEY",
        "GROQ_VISION_MODEL",
        "GROQ_TEXT_MODEL",
        "REMBG_MODEL",
        "REMBG_ALPHA_MATTING",
        "MAX_UPLOAD_MB",
        "SEGMENT_MAX_EDGE",
        "CUTOUT_MAX_EDGE",
        "LABEL_MAX_EDGE",
    ):
        monkeypatch.delenv(var, raising=False)

    settings = Settings(_env_file=None)

    assert settings.groq_api_key == ""
    assert settings.groq_vision_model == "qwen/qwen3.6-27b"
    assert settings.groq_text_model == "openai/gpt-oss-120b"
    assert settings.rembg_model == "birefnet-general"
    assert settings.rembg_alpha_matting is False
    assert settings.max_upload_mb == 12
    assert settings.segment_max_edge == 1600
    assert settings.cutout_max_edge == 1024
    assert settings.label_max_edge == 768
    assert settings.request_timeout_s == 45.0


def test_max_upload_bytes_is_megabytes_times_one_mib():
    assert Settings(_env_file=None, max_upload_mb=5).max_upload_bytes == 5 * 1024 * 1024


def test_environment_overrides_defaults(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "secret-key")
    monkeypatch.setenv("MAX_UPLOAD_MB", "3")
    monkeypatch.setenv("REMBG_MODEL", "birefnet-general-lite")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.groq_api_key == "secret-key"
    assert settings.max_upload_mb == 3
    assert settings.max_upload_bytes == 3 * 1024 * 1024
    assert settings.rembg_model == "birefnet-general-lite"


def test_unknown_environment_variables_are_ignored(monkeypatch):
    # extra="ignore" keeps an unrelated var in the environment from blowing up
    # settings construction.
    monkeypatch.setenv("SOME_UNRELATED_VAR", "value")
    get_settings.cache_clear()

    assert get_settings().max_upload_mb == 12


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
