# ADR-0005: Journal polish — synchronous, opencode-powered

**Status:** Accepted (2026-08-16)

## Context

Kenneth loves the `/journal` loop: raw entry → revised against his style standard → *he approves before it persists*. Aero Diary must reproduce it. He rejected DeepSeek API direct (overpriced for him now) in favor of an **opencode server (OpenAI-compatible)** — same provider family aiworld uses. Requirements: thinking effort at **MAX** so entries never get truncated, and the polish must work in local Mac dev **without depending on the OCI box**.

## Decision

- **UX**: "Polish ✨" button in the New Entry editor → server action `polishEntry(rawText)` → returns revised text into the editor with a **show-original / undo** toggle → Save persists whatever is in the editor. Polish is never required; on LLM failure the entry saves raw. Sync — no background queue in v1 (auto-polish can be a v2 toggle).
- **Endpoint**: OpenAI-compatible, configured per environment via `LLM_BASE_URL` (default `http://127.0.0.1:<port>`). **Each environment runs its own `opencode serve` on localhost**: Mac during dev (his `~/.config/opencode` is already synced to his Mac — same model, same auth), OCI via a systemd unit in prod. No cross-machine dependency.
- **Model**: `opencode-go/deepseek-v4-flash` at `variant: max` → sends `reasoning_effort: max`; 1M context / 384K output ceiling makes truncation a non-issue. Prompt: entry text + the user's style standard + "return the full entry, revised only".
- **Style standard**: per-user setting (`User.styleStandard`); the real user's is seeded from Hermes' `style_summary` (the 11 rules in `journal_cache.json`); the demo user gets a generic standard. Editable later.

## Consequences

- Journal text leaves the server to DeepSeek via opencode — same trust domain as today's `/journal` flow (Hermes already sends it there); no Google involvement (respects the Gemini veto).
- `opencode serve` becomes a dev prerequisite on Mac and a systemd service on OCI (both already provisioned patterns).
- Polish is best-effort by design: persistence never depends on the LLM.
