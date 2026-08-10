"""Runtime configuration, read once from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    groq_api_key: str = ""

    # Verified against console.groq.com/docs/vision (Aug 2026): qwen3.6-27b is
    # currently the only Groq model accepting image input. The Llama 4 vision
    # models the reference material mentions were retired.
    groq_vision_model: str = "qwen/qwen3.6-27b"
    groq_text_model: str = "openai/gpt-oss-120b"

    # birefnet-general gives noticeably tighter edges than u2net, which matters
    # because every cutout is rendered with a contrast stroke around its alpha.
    rembg_model: str = "birefnet-general"
    rembg_alpha_matting: bool = False

    max_upload_mb: int = 12
    #: Longest edge fed to the segmenter. Larger is slower with little gain.
    segment_max_edge: int = 1600
    #: Longest edge of the PNG we hand back to the app and store.
    cutout_max_edge: int = 1024
    #: Longest edge of the JPEG sent to the vision model. Small keeps latency
    #: and token cost down; the subject is already isolated by this point.
    label_max_edge: int = 768

    request_timeout_s: float = 45.0

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
