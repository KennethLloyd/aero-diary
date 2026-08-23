# ADR-0005: Journal polish — synchronous, OpenAI-compatible adapter

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
- **Model**: `LLM_MODEL` and `LLM_REASONING_EFFORT` are configured by environment.
- **Style standard**: `User.styleStandard` is optional per-user data. A nonblank
  value overrides the concise default defined by the polish server action. The
  A user's style standard may be configured separately; users without one use the
  default and are not blocked from polishing. Future UI may let users
  edit or link their own value.

## Consequences

- The app can switch gateways without a code change.
- Journal text leaves the server only through the configured gateway.
- External gateway authentication and lifecycle are outside the application runtime.
