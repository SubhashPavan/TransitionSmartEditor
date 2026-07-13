"""
Azure OpenAI helpers for the sop-editor backend.

One synchronous chat helper — good enough for our low-QPS endpoints.
Switch to AsyncAzureOpenAI + await if traffic ever gets serious.
"""
from __future__ import annotations

from typing import Iterable
from openai import AzureOpenAI

import config

_client: AzureOpenAI | None = None


def _cli() -> AzureOpenAI:
    global _client
    if _client is None:
        if not (config.AZURE_OPENAI_ENDPOINT and config.AZURE_OPENAI_KEY):
            raise RuntimeError("Azure OpenAI is not configured (missing endpoint/key)")
        _client = AzureOpenAI(
            azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
            api_key=config.AZURE_OPENAI_KEY,
            api_version=config.AZURE_OPENAI_API_VERSION,
        )
    return _client


def chat(
    messages: Iterable[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_format: dict | None = None,
) -> str:
    """Call chat completions. Returns the assistant string."""
    resp = _cli().chat.completions.create(
        model=config.AZURE_OPENAI_DEPLOYMENT,
        messages=list(messages),
        temperature=(config.LLM_TEMPERATURE if temperature is None else temperature),
        max_tokens=(config.LLM_MAX_TOKENS if max_tokens is None else max_tokens),
        response_format=response_format,
    )
    choice = resp.choices[0]
    return (choice.message.content or "").strip()
