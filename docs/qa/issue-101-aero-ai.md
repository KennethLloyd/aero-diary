# Aero AI chat overhaul — local review

Ticket: [#101](https://github.com/KennethLloyd/aero-diary/issues/101)

The owner completed local testing, approved the final UI/UX, and authorized committing the changes and opening a PR. They explicitly waived additional screenshots and separate testing.

## What to expect

Aero AI keeps Aero Diary's sky-to-grass background, floating bubbles, frosted-glass panels, glossy blue controls, blue user messages, and assistant orb.

- Desktop has grouped, searchable chat history and a compact conversation header. A trash button opens the delete confirmation directly.
- Mobile uses a native modal history drawer with search, Escape dismissal, focus containment, and focus return.
- The composer starts with two text lines plus a footer, grows automatically to 184px, and only scrolls vertically after its cap. Short viewports use a 104px cap. Send and Stop sit inside it.
- Desktop Enter sends; Shift+Enter adds a line. Mobile/coarse-pointer Enter adds a line. Text composition does not send prematurely.
- Aero AI omits the dock and uses the full available height. A top-left Back button returns to the previous page, with Timeline as the fallback for direct visits. Other pages retain their dock. The page tracks the visible viewport and safe areas.
- The composer has no instructional or decorative helper labels on either desktop or mobile.
- The dock on other pages shows Aero AI immediately, using the same orb as the chat page. Lock now lives in Settings rather than the dock; automatic App Lock monitoring remains active.
- The desktop header explains: “Ask questions about your journal and get answers based on what you’ve written.”
- Messages scroll independently of the header and composer. Reading earlier messages suspends following incoming replies; Jump to latest resumes it.
- Assistant replies render Markdown, retain genuine date links to journal entries, and hide technical source-ID labels. Raw HTML, remote assistant images, and unsafe link schemes are not rendered.
- Saved chats, first-send creation, streaming, Stop, Retry, error recovery, and confirmed deletion use the existing authenticated API.

## Earlier verification

These checks were completed during implementation before the final visual refinements. They are historical results, not a fresh run against the final commit. The owner tested and approved the final experience; no additional test or browser pass was run for PR preparation.

- CI runtime Node 22.23.1: full unit/integration suite **329 passed, 1 skipped**. The system Node 26 runtime fails six pre-existing photo-upload tests; those pass on the configured CI runtime.
- Focused Aero AI/composer/Markdown/dock tests: **11 passed** after the final mobile focus correction.
- Browser regression suite: **6 passed**, covering 1440px, 393px, and 320px widths, composer growth/wrapping, mobile Send/Enter, drawer search and Escape/focus return, preserving reading position, retries with the original request, confirmed deletion, and Back navigation with its direct-visit fallback. These tests intercept only the chat API and use fictional responses; authentication uses the isolated local account.
- Lint, typecheck, production build, and whitespace checks passed during implementation. The production build also passed after the final header wording change.
- Direct in-app browser: desktop 1440×960, mobile 393×852, and a reduced 393×480 visible viewport. Verified actual local thread persistence/reopening, a genuine link to the fictional journal entry, streaming, Stop, and recovery from a local provider error.

## Local review setup and limits

The preview runs at `http://localhost:3230/aero-ai` using a disposable PostgreSQL container on port 5541, fictional journal/chat fixtures, and a deterministic local reply service. The repository's `.env.local` and the live journal were not changed. The review service intentionally supports “slow reply” and “fail once” prompts for checking Stop and Retry.

This verifies the UI and existing request flow. It does not validate live AI answer quality, production deployment, or a physical iPhone's software keyboard. Keyboard space was checked through the visible-viewport handling and reduced-height browser checks.

## Screenshot delivery

Earlier desktop, mobile, mobile-history, and multiline-composer screenshots are retained outside the repository. The owner waived screenshots for this PR after personally testing the final experience. No screenshot binaries are committed or attached.
