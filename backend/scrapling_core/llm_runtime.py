"""
Shared LLM runtime controls: throttling + retry/backoff classification.
"""
from __future__ import annotations

import os
from threading import BoundedSemaphore
from time import sleep
from typing import Any


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


_LLM_MAX_RETRIES = _env_int("LLM_CALL_MAX_RETRIES", 2, 0, 10)
_LLM_RETRY_INITIAL_SECONDS = _env_float("LLM_CALL_RETRY_INITIAL_SECONDS", 1.0, 0.1, 60.0)
_LLM_RETRY_MAX_SECONDS = _env_float("LLM_CALL_RETRY_MAX_SECONDS", 16.0, 0.1, 120.0)
_LLM_MAX_CONCURRENCY = _env_int("LLM_MAX_CONCURRENCY", 4, 1, 32)
_LLM_CONCURRENCY_SEMAPHORE = BoundedSemaphore(_LLM_MAX_CONCURRENCY)


class LlmInvocationError(RuntimeError):
    def __init__(self, stage: str, code: str, message: str):
        super().__init__(f"{stage}:{code}: {message}")
        self.stage = stage
        self.code = code
        self.message = message


def _classify_llm_error(exc: Exception) -> str:
    message = str(exc).lower()
    if "rate limit" in message or "too many requests" in message or "429" in message:
        return "llm_rate_limited"
    if "timeout" in message or "timed out" in message:
        return "llm_timeout"
    if "service unavailable" in message or "503" in message or "overloaded" in message:
        return "llm_service_unavailable"
    if "connection" in message or "network" in message or "dns" in message:
        return "llm_network_error"
    return "llm_invoke_error"


def _is_retryable(code: str) -> bool:
    return code in {
        "llm_rate_limited",
        "llm_timeout",
        "llm_service_unavailable",
        "llm_network_error",
    }


def _extract_content(result: Any) -> str:
    content = getattr(result, "content", result)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
        return "\n".join(parts).strip()
    return str(content)


def invoke_chain_with_retry(chain: Any, payload: dict, *, stage: str) -> str:
    attempts = _LLM_MAX_RETRIES + 1
    last_error: LlmInvocationError | None = None

    for attempt in range(attempts):
        try:
            with _LLM_CONCURRENCY_SEMAPHORE:
                return _extract_content(chain.invoke(payload))
        except Exception as exc:
            code = _classify_llm_error(exc)
            message = str(exc) or code
            llm_error = LlmInvocationError(stage, code, message)
            last_error = llm_error
            should_retry = attempt < attempts - 1 and _is_retryable(code)
            if not should_retry:
                raise llm_error from exc
            delay = min(_LLM_RETRY_INITIAL_SECONDS * (2 ** attempt), _LLM_RETRY_MAX_SECONDS)
            sleep(delay)

    if last_error:
        raise last_error
    raise LlmInvocationError(stage, "llm_unknown_error", "LLM invocation failed without details.")
