"""
LLM factory. Swap between Groq and Claude via environment variable.

Set LLM_PROVIDER=claude and ANTHROPIC_API_KEY to switch to Claude.
Default: Groq (free tier).
"""
import os
from typing import Optional

from env_loader import ensure_local_env_loaded

ensure_local_env_loaded()


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_csv(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return default
    values = [item.strip() for item in raw.split(",")]
    return [value for value in values if value]


def llm_provider() -> str:
    return os.getenv("LLM_PROVIDER", "groq").lower().strip()


def _groq_primary_model() -> str:
    return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"


def _groq_fallback_models() -> list[str]:
    # A lighter default model keeps rewrite available under strict TPD limits.
    return _env_csv("GROQ_FALLBACK_MODELS", ["llama-3.1-8b-instant"])


def _build_groq_llm(model: str):
    from langchain_groq import ChatGroq

    llm_timeout = _env_float("LLM_TIMEOUT_SECONDS", 60.0, 5.0, 600.0)
    llm_max_retries = _env_int("LLM_PROVIDER_MAX_RETRIES", 1, 0, 10)
    return ChatGroq(
        model=model,
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.1,
        request_timeout=llm_timeout,
        max_retries=llm_max_retries,
    )


def get_groq_fallback_llms(*, exclude_model: Optional[str] = None) -> list:
    """
    Build fallback Groq LLM instances to recover from per-model rate limits.
    """
    if llm_provider() != "groq":
        return []

    blocked = {(_groq_primary_model() or "").strip().lower()}
    if exclude_model:
        blocked.add(exclude_model.strip().lower())

    fallbacks = []
    for model in _groq_fallback_models():
        normalized = model.strip().lower()
        if not normalized or normalized in blocked:
            continue
        try:
            fallbacks.append(_build_groq_llm(model))
        except Exception:
            # Keep rewrite path resilient even when a fallback model is unavailable.
            continue
    return fallbacks


def llm_config_error() -> str:
    provider = llm_provider()
    if provider == "claude":
        if not os.getenv("ANTHROPIC_API_KEY"):
            return "ANTHROPIC_API_KEY is not set."
        return ""

    if not os.getenv("GROQ_API_KEY"):
        return "GROQ_API_KEY is not set."
    return ""


def get_llm():
    provider = llm_provider()
    llm_timeout = _env_float("LLM_TIMEOUT_SECONDS", 60.0, 5.0, 600.0)
    llm_max_retries = _env_int("LLM_PROVIDER_MAX_RETRIES", 1, 0, 10)

    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        try:
            return ChatAnthropic(
                model="claude-sonnet-4-20250514",
                api_key=os.getenv("ANTHROPIC_API_KEY"),
                timeout=llm_timeout,
                max_retries=llm_max_retries,
            )
        except TypeError:
            # Backward compatibility with older langchain_anthropic versions.
            return ChatAnthropic(
                model="claude-sonnet-4-20250514",
                api_key=os.getenv("ANTHROPIC_API_KEY"),
            )

    # Use the configured primary model for Groq.
    _ = llm_timeout  # consumed by _build_groq_llm
    _ = llm_max_retries
    return _build_groq_llm(_groq_primary_model())
