# AGENTS.md

# Engineering Guidelines

## Core Principles

- Prioritize simplicity, readability, and maintainability. Prefer solutions that are easier to understand and change, not merely shorter.
- Prefer idiomatic, framework-native solutions over clever code, hacks, or workarounds.
- Keep implementations proportional to current requirements. Avoid overengineering, speculative features, and boilerplate for hypothetical future needs (YAGNI).
- Introduce abstractions, dependencies, or infrastructure only when they solve a concrete problem.
- Follow existing project and framework conventions. Prefer sensible defaults over unnecessary configuration.

## Architecture & Code Quality

- Keep responsibilities clear and related logic together. Separate concerns at meaningful boundaries without introducing unnecessary architectural layers.
- Keep functions focused on one cohesive responsibility. Prefer straightforward control flow, low nesting, and minimal indirection.
- Write code for human readability over clever or compressed syntax. Use meaningful names, clear structure, and semantic spacing: keep related statements together and separate distinct logical steps with blank lines.
- Maintain a single source of truth for business rules and data-access responsibilities. Distinguish genuine knowledge duplication from superficial code similarity before abstracting (DRY).
- Avoid magic values, brittle workarounds, and monkey patches.
- Prefer explicit, safe types where applicable. Avoid unjustified type assertions and unsafe shortcuts.
- Handle meaningful errors appropriately without hiding failures or suppressing warnings.
- Keep comments concise and explain why something exists rather than restating what the code does.
- Remove obsolete code instead of preserving unused implementations.

## Scope & Changes

- Understand the existing implementation, technology stack, and project conventions before making changes. Consult relevant documentation for unfamiliar or version-sensitive APIs.
- Implement only what the task requires. Avoid unrelated refactoring or speculative improvements.
- When ambiguous requirements would materially affect behavior or complexity, clarify the intended flow and trade-offs instead of inventing additional scenarios.
- Preserve existing behavior, user experience, and established conventions unless changes are explicitly requested or necessary to fix a defect.
- Favor the smallest coherent change that fully solves the problem.
- Respect existing boundaries and avoid introducing unnecessary coupling.

## Testing & Verification

- Test meaningful behavior, business rules, important boundaries, and realistic failure scenarios.
- Prefer the most appropriate testing level for the behavior being protected.
- Avoid redundant tests or tests that merely verify framework internals and implementation details without meaningful regression value.
- Run relevant formatting, linting, type-checking, testing, and build commands provided by the project.
- For UI changes, verify actual interactions and affected states in a browser when practical, including responsive behavior.
- Report completed checks, failures, and anything that could not be verified accurately.

## Safety & Delivery

- Preserve unrelated work and avoid destructive Git operations.
- Never commit credentials, secrets, or sensitive environment files. When screenshots are requested as PR evidence, upload them to the PR rather than committing them to the repository.
- Obtain confirmation before destructive database, infrastructure, or cloud operations.
- Review changes before completion and ensure the diff contains only intended modifications.
- Follow the repository's established development and delivery workflow.

### Domain context

Use `CONTEXT.md` at the repository root as the single domain context for vocabulary and constraints.

## Code readability

Write code for a human reviewing the diff. Keep related statements together and separate distinct logical steps with one blank line: validation, preparation, execution, and result handling. In tests, separate setup, action, and assertions, and visually separate independent interaction scenarios. Keep related declarations together; use multiline JSX when props or children become difficult to scan. Separate CSS rules with one blank line.

Before committing, run `pnpm format <files>` and `pnpm lint:readability <files>` on the changed files. Then read every changed hunk and add any semantic separation the tools cannot infer. This pass is complete when each logical phase is easy to identify and the formatting, readability lint, and existing checks pass. CI enforces formatting and readability lint on added or modified files; existing untouched files adopt the standard when changed.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
