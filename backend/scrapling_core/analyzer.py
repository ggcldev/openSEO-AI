"""
Lightweight keyword and content analysis using YAKE + regex NER.
No heavy dependencies (no spaCy, no torch).
"""
import re
import yake


_kw_extractor = None


def _get_yake():
    global _kw_extractor
    if _kw_extractor is None:
        _kw_extractor = yake.KeywordExtractor(
            lan="en", n=3, dedupLim=0.7, top=20, features=None
        )
    return _kw_extractor


def keyword_density(text: str, keyword: str) -> float:
    """Return keyword occurrences / total words as a percentage."""
    words = text.lower().split()
    if not words:
        return 0.0
    kw_lower = keyword.lower()
    count = sum(1 for w in words if kw_lower in w)
    return round(count / len(words) * 100, 2)


def extract_entities(text: str) -> list[str]:
    """
    Lightweight NER — finds capitalized multi-word phrases
    (company names, places, products) without spaCy.
    """
    mid_pattern = r'(?<=\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'
    matches = re.findall(mid_pattern, text)

    stop_phrases = {
        "The", "This", "That", "These", "Those", "There", "Here",
        "However", "Therefore", "Moreover", "Furthermore", "Additionally",
        "Meanwhile", "Nevertheless", "Although", "Because", "Since",
        "While", "Where", "When", "Which", "What", "How", "Why",
        "According", "Also", "Another", "Before", "After", "During",
    }
    seen = set()
    entities = []
    for m in matches:
        m_clean = m.strip()
        if m_clean and m_clean not in seen and m_clean.split()[0] not in stop_phrases:
            seen.add(m_clean)
            entities.append(m_clean)
        if len(entities) >= 30:
            break
    return entities


def analyze_content(text: str, keyword: str) -> dict:
    """
    Analyze a page's body text for SEO metrics.

    Returns:
        word_count, keyword_density, entities,
        top_keywords (YAKE top 10), secondary_keywords (YAKE 11-20)
    """
    if not text.strip():
        return {
            "word_count": 0,
            "keyword_density": 0.0,
            "entities": [],
            "top_keywords": [],
            "secondary_keywords": [],
        }

    word_count = len(text.split())
    density = keyword_density(text, keyword)
    entities = extract_entities(text)

    kw_extractor = _get_yake()
    yake_kws = kw_extractor.extract_keywords(text)
    top_keywords = [kw for kw, _ in yake_kws[:10]]
    secondary_keywords = [kw for kw, _ in yake_kws[10:20]]

    return {
        "word_count": word_count,
        "keyword_density": density,
        "entities": entities,
        "top_keywords": top_keywords,
        "secondary_keywords": secondary_keywords,
    }


def compute_gaps(your_page: dict, competitor_pages: list[dict]) -> dict:
    """
    Compare your page vs competitors and identify gaps.
    """
    if not competitor_pages:
        return {}

    serp_wcs = [p["word_count"] for p in competitor_pages if p["word_count"] > 0]
    serp_avg_wc = int(sum(serp_wcs) / len(serp_wcs)) if serp_wcs else 0
    serp_top_wc = max(serp_wcs) if serp_wcs else 0

    serp_densities = [p["keyword_density"] for p in competitor_pages if p["keyword_density"] > 0]
    serp_avg_density = round(sum(serp_densities) / len(serp_densities), 2) if serp_densities else 0.0

    all_serp_entities: set[str] = set()
    all_serp_keywords: set[str] = set()
    for p in competitor_pages:
        all_serp_entities.update(e.lower() for e in p.get("entities", []))
        all_serp_keywords.update(k.lower() for k in p.get("top_keywords", []))
        all_serp_keywords.update(k.lower() for k in p.get("secondary_keywords", []))

    your_entities = {e.lower() for e in your_page.get("entities", [])}
    your_keywords = {k.lower() for k in your_page.get("top_keywords", [])}
    your_keywords.update(k.lower() for k in your_page.get("secondary_keywords", []))

    return {
        "word_count_gap": your_page["word_count"] - serp_avg_wc,
        "keyword_density_gap": round(your_page["keyword_density"] - serp_avg_density, 2),
        "serp_avg_word_count": serp_avg_wc,
        "serp_top_word_count": serp_top_wc,
        "missing_entities": sorted(all_serp_entities - your_entities)[:20],
        "missing_keywords": sorted(all_serp_keywords - your_keywords)[:20],
    }
