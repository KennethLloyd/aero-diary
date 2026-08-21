# ADR-0005: Journal polish — synchronous, opencode-powered

**Status:** Accepted (2026-08-16)

## Context

Kenneth loves the `/journal` loop: raw entry → revised against his style standard → *he approves before it persists*. Aero Diary must reproduce it. He rejected DeepSeek API direct (overpriced for him now) in favor of an **opencode server (OpenAI-compatible)** — same provider family aiworld uses. Requirements: thinking effort at **MAX** so entries never get truncated, and the polish must work in local Mac dev **without depending on the OCI box**.

## Decision

- **UX**: "Polish ✨" button in the New Entry editor → server action `polishEntry(rawText)` → returns revised text into the editor with a **show-original / undo** toggle → Save persists whatever is in the editor. Polish is never required; on LLM failure the entry saves raw. Sync — no background queue in v1 (auto-polish can be a v2 toggle).
- **Endpoint**: configured per environment via `LLM_BASE_URL` (default `http://127.0.0.1:<port>`) and consumed through the OpenAI-compatible `/v1/chat/completions` transport. **Each environment runs its own `opencode serve` on localhost**: Mac during dev, OCI via a systemd unit in prod. No cross-machine dependency.
- **Model**: configured per environment via `LLM_MODEL`; the initial local trial uses `openai/gpt-5.6-luna` with `LLM_REASONING_EFFORT=medium`. Prompt: entry text + the user's database-backed style standard + "return the full entry, revised only".
- **Style standard**: per-user setting (`User.styleStandard`), populated by the `seed-style-standard` command from a private style file. It is editable later and is never embedded in application source.

## Consequences

- Journal text leaves the server to DeepSeek via opencode — same trust domain as today's `/journal` flow (Hermes already sends it there); no Google involvement (respects the Gemini veto).
- `opencode serve` becomes a dev prerequisite on Mac and a systemd service on OCI (both already provisioned patterns).
- Polish is best-effort by design: persistence never depends on the LLM.
