"""
Style profile extraction utilities.

These heuristics derive tone/voice guardrails from source content so
optimization can improve SEO/GEO/AEO while preserving brand style.
"""
from __future__ import annotations

import re
from typing import Iterable


_CONTRACTION_RE = re.compile(
    r"\b(?:don't|doesn't|didn't|can't|won't|isn't|aren't|it's|that's|there's|you're|we're|they're|i'm|i've|you've|we've|they've)\b",
    flags=re.IGNORECASE,
)
_SECOND_PERSON_RE = re.compile(r"\b(?:you|your|yours)\b", flags=re.IGNORECASE)
_FIRST_PLURAL_RE = re.compile(r"\b(?:we|our|ours|us)\b", flags=re.IGNORECASE)
_FIRST_SINGULAR_RE = re.compile(r"\b(?:i|me|my|mine)\b", flags=re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_HEADING_RE = re.compile(
    r"(?is)<(h[1-6])\b[^>]*>(.*?)</\1>",
)


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _strip_tags(html: str) -> str:
    if not html:
        return ""
    without_tags = _HTML_TAG_RE.sub(" ", html)
    return _normalize_space(without_tags)


def extract_headings_from_html(html: str) -> list[dict]:
    rows: list[dict] = []
    if not html:
        return rows

    for match in _HEADING_RE.findall(html):
        tag, raw = match
        text = _normalize_space(_strip_tags(raw))
        if text:
            rows.append({"tag": tag.lower(), "text": text})
    return rows


def _sentence_lengths(text: str) -> list[int]:
    if not text:
        return []
    sentences = [
        segment.strip()
        for segment in re.split(r"(?<=[.!?])\s+", text)
        if segment.strip()
    ]
    lengths = [len(sentence.split()) for sentence in sentences if sentence]
    return [value for value in lengths if value > 0]


def _top_cta_phrases(text: str) -> list[str]:
    lowered = (text or "").lower()
    candidates = [
        "contact us",
        "get started",
        "learn more",
        "schedule",
        "book",
        "call us",
        "request a quote",
        "free estimate",
        "talk to our team",
    ]
    ranked: list[tuple[int, str]] = []
    for phrase in candidates:
        count = lowered.count(phrase)
        if count > 0:
            ranked.append((count, phrase))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [phrase for _, phrase in ranked[:5]]


def _voice_label(text: str) -> str:
    first_plural = len(_FIRST_PLURAL_RE.findall(text))
    second_person = len(_SECOND_PERSON_RE.findall(text))
    first_singular = len(_FIRST_SINGULAR_RE.findall(text))

    if first_plural > second_person and first_plural >= first_singular:
        return "first_person_plural"
    if second_person >= first_plural and second_person >= first_singular:
        return "second_person_direct"
    if first_singular > 0:
        return "first_person_singular"
    return "neutral_third_person"


def _formality_label(text: str, word_count: int) -> str:
    if word_count <= 0:
        return "balanced"
    contractions = len(_CONTRACTION_RE.findall(text))
    contraction_ratio = contractions / max(word_count, 1)
    if contraction_ratio >= 0.015:
        return "conversational"
    if contraction_ratio <= 0.002:
        return "formal"
    return "balanced"


def _sentence_style_label(lengths: Iterable[int]) -> str:
    values = list(lengths)
    if not values:
        return "medium"
    avg_words = sum(values) / len(values)
    if avg_words < 14:
        return "short"
    if avg_words > 23:
        return "long"
    return "medium"


def _energy_label(text: str) -> str:
    exclamations = (text or "").count("!")
    if exclamations >= 5:
        return "enthusiastic"
    if exclamations <= 1:
        return "calm"
    return "assertive"


def _heading_style(headings: list[dict]) -> str:
    if not headings:
        return "statement_heavy"
    question_count = sum(
        1 for heading in headings if "?" in str(heading.get("text", ""))
    )
    ratio = question_count / max(len(headings), 1)
    if ratio >= 0.4:
        return "question_heavy"
    return "statement_heavy"


def build_style_profile(
    *,
    title: str,
    body_text: str,
    headings: list[dict] | None = None,
) -> dict:
    normalized_text = _normalize_space(body_text)
    heading_rows = headings or []
    words = normalized_text.split()
    word_count = len(words)
    sentence_lengths = _sentence_lengths(normalized_text)

    voice = _voice_label(normalized_text)
    formality = _formality_label(normalized_text, word_count)
    sentence_style = _sentence_style_label(sentence_lengths)
    energy = _energy_label(normalized_text)
    heading_style = _heading_style(heading_rows)
    cta_phrases = _top_cta_phrases(normalized_text)

    guidance: list[str] = []
    if voice == "first_person_plural":
        guidance.append("Keep collaborative 'we/our' voice.")
    elif voice == "second_person_direct":
        guidance.append("Keep direct second-person wording for reader guidance.")
    elif voice == "first_person_singular":
        guidance.append("Preserve first-person narrative voice where present.")
    else:
        guidance.append("Keep neutral, third-person brand tone.")

    if formality == "conversational":
        guidance.append("Retain approachable phrasing and natural contractions.")
    elif formality == "formal":
        guidance.append("Maintain formal and professional sentence construction.")
    else:
        guidance.append("Maintain balanced professional-conversational tone.")

    if sentence_style == "short":
        guidance.append("Prefer concise, easy-to-scan sentences.")
    elif sentence_style == "long":
        guidance.append("Preserve detailed explanatory cadence while improving clarity.")
    else:
        guidance.append("Use medium-length explanatory sentences.")

    if heading_style == "question_heavy":
        guidance.append("Preserve question-led heading style where helpful.")
    else:
        guidance.append("Keep statement-led heading style and section framing.")

    if cta_phrases:
        guidance.append(f"Preserve CTA language patterns: {', '.join(cta_phrases)}.")

    return {
        "title": (title or "").strip(),
        "voice": voice,
        "formality": formality,
        "sentence_style": sentence_style,
        "energy": energy,
        "heading_style": heading_style,
        "cta_phrases": cta_phrases,
        "word_count": word_count,
        "guidance": guidance,
    }


def format_style_profile(profile: dict | None) -> str:
    if not profile:
        return "No style profile available. Preserve source tone conservatively."

    guidance = profile.get("guidance") or []
    guidance_lines = "\n".join(f"- {item}" for item in guidance if isinstance(item, str))
    cta_values = profile.get("cta_phrases") or []
    cta_text = ", ".join(value for value in cta_values if isinstance(value, str)) or "none"

    return (
        f"Voice: {profile.get('voice', 'unknown')}\n"
        f"Formality: {profile.get('formality', 'unknown')}\n"
        f"Sentence style: {profile.get('sentence_style', 'unknown')}\n"
        f"Energy: {profile.get('energy', 'unknown')}\n"
        f"Heading style: {profile.get('heading_style', 'unknown')}\n"
        f"CTA phrases: {cta_text}\n"
        f"Guidance:\n{guidance_lines or '- Preserve existing tone and phrasing patterns.'}"
    )
