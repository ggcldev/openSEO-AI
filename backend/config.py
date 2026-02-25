"""
LLM factory. Swap between Groq and Claude via environment variable.

Set LLM_PROVIDER=claude and ANTHROPIC_API_KEY to switch to Claude.
Default: Groq (free tier).
"""
import os


def get_llm():
    provider = os.getenv("LLM_PROVIDER", "groq").lower()

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
