"""
Agentic-RAG chat. GPT-4o runs a small tool-calling loop over two tools
that talk to the local transcript index (rag.py):

  search_transcript(query, source_key?) → top hits with timestamps
  list_sources()                        → source_keys available

The loop:

  1. Prime with the user's question + conversation history.
  2. Model calls a tool (or answers directly).
  3. We run the tool, append its result as a tool message, and loop.
  4. When the model returns a plain answer, we return it plus a
     de-duplicated citation list assembled from every search hit the
     agent ever consumed during that turn — so the frontend can render
     "▶ ariba_part01 · 04:22-04:38" chips that jump to the segment.

The system prompt tells the model to always cite what it uses and to
never invent facts that aren't in the returned hits.
"""
from __future__ import annotations

import json
from typing import Any

import config
import rag as rag_mod


SYSTEM_PROMPT = (
    "You are TransitionSmart's SOP research assistant. You help the writer + reviewer "
    "understand what happened in the source videos and PDFs so they can build accurate SOPs.\n\n"
    "Ground rules:\n"
    "  - Prefer to answer FROM THE TRANSCRIPT. Use the search_transcript tool aggressively. "
    "Never invent facts, timings, or step names that don't appear in a returned hit.\n"
    "  - You can call list_sources first if the user asks 'what videos do we have?'.\n"
    "  - Each search returns text + start/end timestamps + a source_key. Weave the timestamps "
    "into your answer as `[MM:SS]` markers so the reader can jump straight to the moment.\n"
    "  - If nothing matches, say so plainly — don't paper over.\n"
    "  - Keep answers concise: 2-6 sentences unless the user asked for detail."
)


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_sources",
            "description": "List every video/transcript source_key that's indexed.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_transcript",
            "description": (
                "Semantic search over the video transcripts. Returns up to `k` chunks "
                "with source_key, text, and start/end seconds. Use this every time you "
                "need to answer a question about what was said or shown."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query":      {"type": "string", "description": "The natural-language query."},
                    "source_key": {"type": "string", "description": "Optional: restrict to one video's transcript."},
                    "k":          {"type": "integer", "description": "How many hits to return.", "default": 6, "minimum": 1, "maximum": 20},
                },
                "required": ["query"],
            },
        },
    },
]


def _openai_client():
    from openai import AzureOpenAI
    return AzureOpenAI(
        api_key       = config.AZURE_OPENAI_KEY,
        api_version   = config.AZURE_OPENAI_API_VERSION,
        azure_endpoint= config.AZURE_OPENAI_ENDPOINT,
    )


def _run_tool(name: str, args: dict) -> tuple[str, list[dict]]:
    """
    Execute one tool call and return (text_for_llm, hits_for_citations).
    `hits_for_citations` is a list of dicts we'll surface to the frontend
    as clickable citation chips.
    """
    if name == "list_sources":
        srcs = rag_mod.sources()
        return json.dumps({"sources": srcs}), []
    if name == "search_transcript":
        q = (args.get("query") or "").strip()
        k = int(args.get("k") or 6)
        src = args.get("source_key") or None
        hits = rag_mod.search(q, k=k, source_filter=src)
        # Trim text in the LLM view so we don't blow context on big chunks.
        trimmed = [
            {
                "source_key": h["source_key"],
                "start_sec":  round(h["start_sec"], 1),
                "end_sec":    round(h["end_sec"], 1),
                "text":       (h["text"][:600] + ("…" if len(h["text"]) > 600 else "")),
                "score":      round(h["score"], 3),
            }
            for h in hits
        ]
        return json.dumps({"hits": trimmed}), hits
    return json.dumps({"error": f"unknown tool: {name}"}), []


def answer(user_question: str,
           history: list[dict] | None = None,
           default_source_key: str | None = None) -> dict:
    """
    Run the tool loop and return {answer, citations, tool_trace}.
    `history` is an optional list of prior {role, content} messages
    (max ~10) so the assistant remembers earlier turns in the session.
    """
    if not (user_question or "").strip():
        raise ValueError("empty question")

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if default_source_key:
        messages.append({
            "role": "system",
            "content": (
                f"Context: the writer is looking at the '{default_source_key}' video. "
                f"Prefer to filter searches to that source unless the question is clearly cross-cutting."
            ),
        })
    # Prior turns
    for m in (history or [])[-10:]:
        role = m.get("role")
        text = (m.get("content") or "").strip()
        if role in ("user", "assistant") and text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": user_question})

    client = _openai_client()
    all_citations: list[dict] = []
    trace: list[dict] = []

    # Guardrail: the tool loop can't run forever.
    for _step in range(6):
        resp = client.chat.completions.create(
            model     = config.AZURE_OPENAI_DEPLOYMENT,
            messages  = messages,
            tools     = TOOLS,
            tool_choice = "auto",
            temperature = 0.2,
            max_tokens  = 900,
        )
        msg = resp.choices[0].message
        # Model wants to call one or more tools?
        tool_calls = getattr(msg, "tool_calls", None) or []
        if tool_calls:
            # Append the assistant turn so tool responses attach correctly
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tool_calls
                ],
            })
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except Exception:
                    args = {}
                result, hits = _run_tool(tc.function.name, args)
                trace.append({"tool": tc.function.name, "args": args, "hit_count": len(hits)})
                all_citations.extend(hits)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue
        # Plain answer — we're done.
        break

    final_text = (msg.content or "").strip()
    # Deduplicate citations by (source_key, rounded start_sec) so the same
    # chunk doesn't appear as two chips.
    seen = set()
    dedup: list[dict] = []
    for h in all_citations:
        key = (h["source_key"], round(float(h["start_sec"]), 1))
        if key in seen: continue
        seen.add(key)
        dedup.append({
            "source_key": h["source_key"],
            "start_sec":  h["start_sec"],
            "end_sec":    h["end_sec"],
            "text":       h["text"],
            "score":      h["score"],
        })
    return {
        "answer":     final_text,
        "citations":  dedup,
        "tool_trace": trace,
    }
