"""
LLM factory. Swap between Groq and Claude via environment variable.

Set LLM_PROVIDER=claude and ANTHROPIC_API_KEY to switch to Claude.
Default: Groq (free tier).
"""
import os


def llm_provider() -> str:
    return os.getenv("LLM_PROVIDER", "groq").lower().strip()


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

    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )

    from langchain_groq import ChatGroq
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.1,
    )
