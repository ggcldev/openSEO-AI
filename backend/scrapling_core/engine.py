"""
Scraping engine powered by Scrapling + Playwright.
Fetches and extracts structured content from any URL.
"""
from __future__ import annotations

import os
import re
from concurrent.futures import CancelledError, ThreadPoolExecutor, as_completed
from html import unescape
from threading import BoundedSemaphore
from time import sleep
from typing import Optional

from scrapling.fetchers import StealthyFetcher, Fetcher


_NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    "script", "style", "noscript", "iframe",
    ".cookie-banner", ".ad", ".advertisement",
    ".sidebar", ".menu",
]

_SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style|noscript|iframe)\b[^>]*>.*?</\1>")
_BLOCK_NOISE_RE = re.compile(r"(?is)<(nav|header|footer|aside)\b[^>]*>.*?</\1>")
_TAG_RE = re.compile(r"(?is)<[^>]+>")
_TITLE_RE = re.compile(r"(?is)<title\b[^>]*>(.*?)</title>")
_HEADING_RE = re.compile(r"(?is)<(h[1-3])\b[^>]*>(.*?)</\1>")


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


_STEALTHY_FETCH_MAX_CONCURRENCY = max(
    1,
    min(8, _env_int("STEALTHY_FETCH_MAX_CONCURRENCY", 2, 1, 8)),
)
_STEALTHY_FETCH_SEMAPHORE = BoundedSemaphore(_STEALTHY_FETCH_MAX_CONCURRENCY)
_COMPETITOR_SCRAPE_MAX_WORKERS = _env_int("COMPETITOR_SCRAPE_MAX_WORKERS", 4, 1, 12)
_CASCADE_FAIL_MIN_SAMPLES = _env_int("SCRAPE_CASCADE_FAIL_MIN_SAMPLES", 4, 2, 20)
_CASCADE_FAIL_RATIO = _env_float("SCRAPE_CASCADE_FAIL_RATIO", 0.9, 0.5, 1.0)
_MIN_FALLBACK_WORDS = _env_int("SCRAPE_MIN_WORDS_FOR_HTML_FALLBACK", 60, 5, 1000)


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _extract_title_from_html(html: str) -> str:
    if not html:
        return ""
    match = _TITLE_RE.search(html)
    if not match:
        return ""
    raw_title = _TAG_RE.sub(" ", match.group(1))
    return _normalize_space(unescape(raw_title))


def _extract_headings_from_html(html: str) -> list[dict]:
    if not html:
        return []

    rows: list[dict] = []
    for tag, raw in _HEADING_RE.findall(html):
        text = _normalize_space(unescape(_TAG_RE.sub(" ", raw)))
        if text:
            rows.append({"tag": tag.lower(), "text": text})
    return rows


def _extract_body_text_from_html(html: str) -> str:
    if not html:
        return ""
    cleaned = _SCRIPT_STYLE_RE.sub(" ", html)
    cleaned = _BLOCK_NOISE_RE.sub(" ", cleaned)
    text = _TAG_RE.sub(" ", cleaned)
    return _normalize_space(unescape(text))


def _classify_fetch_error(error: Exception) -> str:
    message = str(error).lower()
    if "timeout" in message:
        return "timeout"
    if "captcha" in message or "challenge" in message or "forbidden" in message or "403" in message:
        return "blocked"
    if "name or service not known" in message or "temporary failure in name resolution" in message:
        return "dns_error"
    if "nodename nor servname provided" in message:
        return "dns_error"
    if "ssl" in message or "tls" in message or "certificate" in message:
        return "tls_error"
    if "connection refused" in message or "connection reset" in message or "network" in message:
        return "network_error"
    return "unknown_error"


def _fetch_with_retries(url: str, max_attempts: int = 3):
    last_error: Optional[Exception] = None
    fallback_fetcher = Fetcher()
    stealthy_attempted = False

    for attempt in range(1, max_attempts + 1):
        try:
            # Prefer lightweight HTTP fetch first to avoid launching browser engines unnecessarily.
            return fallback_fetcher.get(url, stealthy_headers=True, retries=1, timeout=20), attempt
        except Exception as fallback_error:
            last_error = fallback_error
            code = _classify_fetch_error(fallback_error)

        # Only escalate to browser-backed fetches for anti-bot/time-sensitive failures.
        if code in {"blocked", "timeout"} and not stealthy_attempted:
            stealthy_attempted = True
            try:
                with _STEALTHY_FETCH_SEMAPHORE:
                    return StealthyFetcher.fetch(
                        url,
                        disable_resources=True,
                        block_images=True,
                        wait=0,
                        timeout=30000,
                    ), attempt
            except Exception as stealth_error:
                last_error = stealth_error

        if attempt < max_attempts:
            sleep(min(1.5 * attempt, 4.0))

    raise last_error or RuntimeError("Scrape request failed without a detailed error.")


def scrape_page(url: str, max_attempts: int = 3) -> dict:
    """
    Fetch a page and extract structured content.
    Uses StealthyFetcher (Playwright) with Fetcher fallback and retries.

    Returns:
        {url, title, headings, body_text, word_count, raw_html, error, error_code}
    """
    result = {
        "url": url,
        "title": "",
        "headings": [],
        "body_text": "",
        "raw_html": "",
        "word_count": 0,
        "status_code": None,
        "attempts": 0,
        "error": None,
        "error_code": None,
    }

    try:
        page, attempts = _fetch_with_retries(url, max_attempts=max_attempts)
        result["attempts"] = attempts
    except Exception as fetch_error:
        result["error"] = str(fetch_error)
        result["error_code"] = _classify_fetch_error(fetch_error)
        result["attempts"] = max_attempts
        return result

    result["status_code"] = getattr(page, "status", None)
    result["raw_html"] = getattr(page, "html_content", "") or ""

    # Title
    try:
        result["title"] = page.find("title").text or ""
    except Exception:
        pass

    # Headings (h1, h2, h3)
    for tag in ["h1", "h2", "h3"]:
        try:
            for el in page.find_all(tag):
                text = el.text.strip()
                if text:
                    result["headings"].append({"tag": tag, "text": text})
        except Exception:
            pass

    # Strip noise and extract body text
    for selector in _NOISE_SELECTORS:
        try:
            for el in page.find_all(selector):
                el.remove()
        except Exception:
            pass

    try:
        body = page.find("body")
        raw = body.text.strip() if body else page.text.strip()
        result["body_text"] = re.sub(r"\s+", " ", raw).strip()
    except Exception:
        pass

    if not result["raw_html"]:
        # Fallback when html_content is not available.
        result["raw_html"] = page.text or ""

    if not result["title"] and result["raw_html"]:
        result["title"] = _extract_title_from_html(result["raw_html"])

    if not result["headings"] and result["raw_html"]:
        result["headings"] = _extract_headings_from_html(result["raw_html"])

    current_words = len(result["body_text"].split())
    if result["raw_html"] and current_words < _MIN_FALLBACK_WORDS:
        fallback_body = _extract_body_text_from_html(result["raw_html"])
        fallback_words = len(fallback_body.split())
        if fallback_words > current_words:
            result["body_text"] = fallback_body
            current_words = fallback_words

    result["word_count"] = current_words
    return result


def scrape_pages_parallel(urls: list[str], max_workers: int = 4, max_attempts: int = 2) -> list[dict]:
    """Scrape multiple pages concurrently."""
    if not urls:
        return []

    worker_count = min(max(1, max_workers), _COMPETITOR_SCRAPE_MAX_WORKERS, len(urls))
    transient_errors = {"blocked", "timeout", "network_error", "dns_error", "tls_error"}

    results = []
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_to_url = {
            executor.submit(scrape_page, url, max_attempts=max_attempts): url for url in urls
        }
        total_seen = 0
        failed_seen = 0
        cascade_triggered = False

        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                page = future.result()
                results.append(page)
                total_seen += 1
                if page.get("error") and page.get("error_code") in transient_errors:
                    failed_seen += 1
            except Exception as exc:
                total_seen += 1
                if isinstance(exc, CancelledError):
                    error_code = "cancelled"
                    error_message = "Scrape task cancelled due to high failure ratio."
                else:
                    error_code = _classify_fetch_error(exc)
                    error_message = str(exc)
                    if error_code in transient_errors:
                        failed_seen += 1
                results.append(
                    {
                        "url": url,
                        "title": "",
                        "headings": [],
                        "body_text": "",
                        "raw_html": "",
                        "word_count": 0,
                        "status_code": None,
                        "attempts": max_attempts,
                        "error": error_message,
                        "error_code": error_code,
                    }
                )

            if (
                not cascade_triggered
                and total_seen >= _CASCADE_FAIL_MIN_SAMPLES
                and (failed_seen / max(total_seen, 1)) >= _CASCADE_FAIL_RATIO
            ):
                cascade_triggered = True
                for pending_future in future_to_url:
                    if not pending_future.done():
                        pending_future.cancel()

    return results
