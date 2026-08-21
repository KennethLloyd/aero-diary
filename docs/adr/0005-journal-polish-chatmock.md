# ADR-0005: Journal polish — synchronous, ChatMock-backed

**Status:** Accepted (2026-08-21)

## Context

Aero Diary needs a best-effort polish loop: raw entry → revised against the
user's database-backed style standard → the user approves before saving. The
application must not depend on a model provider's SDK, CLI, or native API.

## Decision

- **UX**: "Polish ✨" in the New Entry editor calls a server action and returns
  revised text with show-original and undo controls. Save persists whatever is
  currently in the editor. Polish is never required; failures leave raw-save
  available.
- **Transport**: `LLM_BASE_URL` points to an OpenAI-compatible gateway. The
  `OpenAiCompatibleLlmAdapter` sends `POST /v1/chat/completions` and implements
  the provider-neutral `LlmClient` interface. `llm-client-config.ts` is the
  composition root; journal business logic receives only `LlmClient` and does
  not know the adapter's wire format.
- **Local gateway**: ChatMock is the local development gateway. It is installed
  and authenticated outside the repository, then served at
  `http://127.0.0.1:8000/v1` with legacy reasoning compatibility so reasoning
  metadata is not mixed into journal text. The repository only knows the
  OpenAI-compatible contract.
- **Model**: `LLM_MODEL` is configured by environment. The local trial uses
  `gpt-5.6-luna` with `LLM_REASONING_EFFORT=medium`.
- **Style standard**: `User.styleStandard` is optional per-user data. A nonblank
  value overrides the concise default defined by the polish server action. The
  real user's private standard is seeded from a private file; users without one
  use the default and are not blocked from polishing. Future UI may let users
  edit or link their own value.

## Consequences

- The app can switch gateways without a code change.
- Journal text leaves the server only through the configured gateway.
- ChatMock login and server lifecycle are local development prerequisites, not
  application runtime dependencies.
