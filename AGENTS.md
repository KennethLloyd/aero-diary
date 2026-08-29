# AGENTS.md

## GitHub issues and pull requests

Use GitHub issues as the issue tracker through the `gh` CLI.

For issue work:

1. Create `feat/issue-<n>-<slug>` before editing (for example, `feat/issue-1-scaffold`).
2. Commit all changes on that feature branch.
3. Push the branch and open a PR with `gh pr create`; start its body with `Closes #<n>`.
4. Keep the issue open until the PR merges; GitHub closes it from the closing phrase.

Delivery is complete when the changes are committed on the feature branch and the PR is open. Issue closure follows the merge.

### Triage labels

Use these canonical role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.

### Domain context

Use `CONTEXT.md` at the repository root as the single domain context for vocabulary and constraints.

## Architecture

Treat idiomatic, framework-native architecture as a hard constraint.

Prefer the capabilities already provided by Next.js, Tailwind, and the existing feature boundaries. Use custom scripts, monkey patches, test harnesses, or workaround layers only after checking those capabilities. If a workaround is unavoidable, isolate it, keep it minimal, and document its architectural reason.

## UI verification and PR evidence

Every UI pull request completes a browser-first verification pass:

1. Exercise the changed flow end-to-end with the `control-in-app-browser` skill. Cover affected validation, loading and error states, edits, retrieval and rendering, downloads, and deletes where present. Re-snapshot after navigation and dynamic state changes.
2. Verify every materially different page or state involved in the change at a desktop viewport of `1280px` or wider and an iPhone 15-sized viewport of `393×852`.
3. Capture PR screenshots from the in-app browser. Use two screenshots only when each shows a complete page and together covers the change; otherwise include additional screenshots. Evidence must include both mobile and desktop views and visibly showcase the new behavior.
4. Add a `What to expect` section to the PR description or a PR comment in simplified technical, product-facing English. Explain the visible change, key interactions, responsive behavior, and demo-data limitations.
5. For destructive cloud actions, confirm at the moment of the action. If confirmation is unavailable, use safe checks and document the limitation.

Use the relevant `agent-browser` flow as a complementary automated check or as a fallback when the in-app browser is unavailable. Direct browser verification remains the acceptance check.

The UI verification step is complete when the relevant browser scenarios pass, the required desktop and mobile screenshots are attached, and the PR includes the `What to expect` section.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
