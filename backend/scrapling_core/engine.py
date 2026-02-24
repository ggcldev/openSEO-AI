"""
Scraping engine powered by Scrapling + Playwright.
Supports multiple AI agent modes for processing scraped content.
"""
import json
from scrapling.fetchers import StealthyFetcher, Fetcher


# CSS selectors for noise elements to strip
_NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    "script", "style", "noscript", "iframe",
    ".cookie-banner", ".ad", ".advertisement",
    ".sidebar", ".menu",
]


def _scrape_page(url: str) -> dict:
    """
    Fetch a page and extract structured content.
    Uses StealthyFetcher (Playwright) with Fetcher as fallback.
    """
    try:
        page = StealthyFetcher().fetch(url, stealthy_headers=True)
    except Exception:
        try:
            page = Fetcher().fetch(url)
        except Exception as e:
            return {"url": url, "error": str(e), "title": "", "body_text": "", "headings": []}

    result = {"url": url, "error": None}

    # Title
    try:
        result["title"] = page.find("title").text or ""
    except Exception:
        result["title"] = ""

    # Headings
    headings = []
    for tag in ["h1", "h2", "h3"]:
        try:
            for el in page.find_all(tag):
                text = el.text.strip()
                if text:
                    headings.append({"tag": tag, "text": text})
        except Exception:
            pass
    result["headings"] = headings

    # Strip noise and extract body text
    for selector in _NOISE_SELECTORS:
        try:
            for el in page.find_all(selector):
                el.remove()
        except Exception:
            pass

    try:
        body = page.find("body")
        result["body_text"] = body.text.strip() if body else page.text.strip()
    except Exception:
        result["body_text"] = ""

    result["word_count"] = len(result["body_text"].split())
    return result


def _agent_summarize(scraped: dict) -> dict:
    """Summarize agent — returns a structured summary of the page."""
    body = scraped.get("body_text", "")
    words = body.split()
    snippet = " ".join(words[:200]) + ("..." if len(words) > 200 else "")

    return {
        "agent": "summarize",
        "title": scraped.get("title", ""),
        "url": scraped.get("url", ""),
        "word_count": scraped.get("word_count", 0),
        "headings": scraped.get("headings", []),
        "snippet": snippet,
    }


def _agent_extract(scraped: dict) -> dict:
    """Extract agent — returns all structured data from the page."""
    return {
        "agent": "extract",
        "title": scraped.get("title", ""),
        "url": scraped.get("url", ""),
        "word_count": scraped.get("word_count", 0),
        "headings": scraped.get("headings", []),
        "body_text": scraped.get("body_text", ""),
    }


def _agent_raw(scraped: dict) -> dict:
    """Raw agent — returns the raw scraped data as-is."""
    return {"agent": "raw", **scraped}


# Agent registry
_AGENTS = {
    "summarize": _agent_summarize,
    "extract": _agent_extract,
    "raw": _agent_raw,
}


def run_scrape(url: str, agent: str = "summarize", config: dict = None) -> str:
    """
    Main entry point: scrape a URL and process with the specified agent.

    Args:
        url:    The URL to scrape.
        agent:  Agent type — "summarize", "extract", or "raw".
        config: Optional config dict (for future use).

    Returns:
        JSON string with the agent's output.
    """
    scraped = _scrape_page(url)

    if scraped.get("error"):
        return json.dumps({"error": scraped["error"], "url": url})

    agent_fn = _AGENTS.get(agent, _agent_summarize)
    result = agent_fn(scraped)

    return json.dumps(result, ensure_ascii=False, indent=2)
