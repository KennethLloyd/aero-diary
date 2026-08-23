# AGENTS.md

## Agent skills

### Issue tracker

Issues live as GitHub issues, driven through the `gh` CLI.

### Issue workflow — branch + PR, never close early

Every issue ships through a pull request, never a direct commit to `main`:

1. **Check out a new feature branch first**: `git checkout -b feat/issue-<n>-<slug>` (match existing naming, e.g. `feat/issue-1-scaffold`).
2. **Commit all changes to the feature branch** — never commit to `main`.
3. **Push the branch and open a PR** with `gh pr create`, body starting with `Closes #<n>`.
4. **Never close the issue while its PR is still open.** The issue closes only when the PR merges (GitHub auto-closes via `Closes #<n>`). If the PR is open or under review, the issue stays open.

### Triage labels

Five canonical roles use these default label names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.

### Domain docs

Single-context: use `CONTEXT.md` at the repository root for domain vocabulary and constraints.

## Architecture and Idiomaticity

- Treat idiomatic, framework-native architecture as a hard project constraint.
- Prefer the capabilities already provided by Next.js, Tailwind, and the existing feature boundaries before adding
  custom scripts, monkey patches, test harnesses, or other workaround layers.
- Do not add noisy or non-idiomatic scaffolding to hide a race condition or
  paper over an unclear ownership boundary. If a workaround is unavoidable,
  document the architectural reason and keep it isolated and minimal.

## Verification

### UI change verification and PR evidence

Every UI pull request follows a browser-first, exhaustive verification pass before the PR is created or updated:

1. Use the `control-in-app-browser` skill to exercise the changed flow end-to-end, then test the surrounding affected areas (including validation, loading/error states, edits, retrieval/rendering, downloads, and deletes when applicable). Re-snapshot after navigation or dynamic state changes.
2. Verify responsive behavior at an iPhone 15-sized viewport (`393×852`) and a desktop viewport (`1280px` wide or larger). Cover every materially different page or state involved in the change.
3. Capture PR screenshots from the in-app browser. Two screenshots are sufficient only when they each show a complete page and together cover the change; otherwise include additional screenshots for the other pages or states. The evidence must include both mobile and desktop views and visibly showcase the new behavior.
4. Add a `What to expect` section to the PR description or a PR comment, written in simplified technical, product-facing English. It must explain the visible change, key interactions, responsive behavior, and any demo-data limitations.

The UI verification step is complete only when the relevant browser scenarios pass, the necessary desktop/mobile screenshots are attached, and the PR includes the `What to expect` section. For destructive cloud actions, obtain confirmation at the moment of the action; if confirmation is unavailable, use safe checks and document the limitation.

For UI work, prefer the `control-in-app-browser` skill when it is available:
use it to inspect the rendered page, exercise the affected interactions, and
spot responsive or visual UX regressions directly. Run the relevant
`agent-browser` flow from the plan as a complementary automated check or as a
fallback when the in-app browser is unavailable. Re-snapshot after navigation
or dynamic UI changes; automated tests do not replace direct browser
verification for UI behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
