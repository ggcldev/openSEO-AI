"""
Scraping engine powered by Scrapling + Playwright.
Fetches and extracts structured content from any URL.
"""
from scrapling.fetchers import StealthyFetcher, Fetcher


_NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    "script", "style", "noscript", "iframe",
    ".cookie-banner", ".ad", ".advertisement",
    ".sidebar", ".menu",
]


def scrape_page(url: str) -> dict:
    """
    Fetch a page and extract structured content.
    Uses StealthyFetcher (Playwright) with Fetcher as fallback.

    Returns:
        {url, title, headings, body_text, word_count, error}
    """
    result = {
        "url": url,
        "title": "",
        "headings": [],
        "body_text": "",
        "word_count": 0,
        "error": None,
    }

    try:
        page = StealthyFetcher().fetch(url, stealthy_headers=True)
    except Exception:
        try:
            page = Fetcher().fetch(url)
        except Exception as e:
            result["error"] = str(e)
            return result

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
        # Clean whitespace
        import re
        result["body_text"] = re.sub(r"\s+", " ", raw).strip()
    except Exception:
        pass

    result["word_count"] = len(result["body_text"].split())
    return result


def scrape_pages_parallel(urls: list[str], max_workers: int = 4) -> list[dict]:
    """Scrape multiple pages concurrently."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {executor.submit(scrape_page, url): url for url in urls}
        for future in as_completed(future_to_url):
            results.append(future.result())
    return results
