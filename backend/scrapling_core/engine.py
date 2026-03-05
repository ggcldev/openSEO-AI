"""
Scraping engine powered by Scrapling + Playwright.
Fetches and extracts structured content from any URL.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import sleep
from typing import Optional

from scrapling.fetchers import StealthyFetcher, Fetcher


_NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    "script", "style", "noscript", "iframe",
    ".cookie-banner", ".ad", ".advertisement",
    ".sidebar", ".menu",
]


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
    for attempt in range(1, max_attempts + 1):
        try:
            return StealthyFetcher().fetch(url), attempt
        except Exception as stealth_error:
            last_error = stealth_error

        try:
            return Fetcher().get(url, stealthy_headers=True, retries=1, timeout=20), attempt
        except Exception as fallback_error:
            last_error = fallback_error

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

    result["word_count"] = len(result["body_text"].split())
    return result


def scrape_pages_parallel(urls: list[str], max_workers: int = 4, max_attempts: int = 2) -> list[dict]:
    """Scrape multiple pages concurrently."""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {
            executor.submit(scrape_page, url, max_attempts=max_attempts): url for url in urls
        }
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                results.append(future.result())
            except Exception as exc:
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
                        "error": str(exc),
                        "error_code": _classify_fetch_error(exc),
                    }
                )
    return results
