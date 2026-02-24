"""
Google SERP fetcher using googlesearch-python.
Returns top N organic URLs for a given keyword.
"""
from googlesearch import search


def get_serp_urls(keyword: str, num: int = 10) -> list[str]:
    """
    Fetch top organic Google results for a keyword.

    Args:
        keyword: The search query.
        num:     Number of results to return.

    Returns:
        List of deduplicated URLs.
    """
    urls: list[str] = []
    try:
        results = search(
            keyword,
            num_results=num + 3,
            lang="en",
            sleep_interval=1,
        )
        for url in results:
            if url and url not in urls:
                urls.append(url)
            if len(urls) >= num:
                break
    except Exception as e:
        raise RuntimeError(f"SERP fetch failed: {e}")

    return urls
