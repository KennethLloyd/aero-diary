# ADR-0009: Frutiger Aero design system — vibes are locked

**Status:** Accepted (2026-08-16)

## Context

Kenneth: "the vibes should not be changed, the prototype vibes is already nostalgic and perfect for my taste so the coding of the styles should follow exactly that theme." The prototype (`aero_diary.html`) is the spec. The vision-model rundown (8 screens) catalogued the exact visual language.

## Decision

- The prototype's visual language is implemented as a **design-token layer + aero component classes**, not pixel-dusted one-offs:
  - Tokens: sky→grass gradient background (fixed attachment), bubble animation, glass panel recipe (translucency, borders, inset highlights, backdrop blur), glossy button recipe (4-stop highlight split), orb recipe (specular highlight via ::after), progress-bar gloss, dock glass.
  - Component classes: `.aero-glass`, `.aero-btn` (+white/red variants), `.aero-input`, `.aero-orb` (5 mood variants: awful red → rad cyan), `.aero-dock`, `.aero-logo-orb`, `.aero-progress-*`, `.aero-modal` (Vista title-bar dialog).
  - Typography: humanist sans stack (Segoe UI / Frutiger / Helvetica Neue) — matches the prototype.
- All 8 screens are rebuilt faithfully: login (now with the auth form — the only sanctioned change), timeline, calendar, activities, insights, new entry, entry detail (polaroid photo strip), delete modal.
- The login screen's Google button becomes the aero-styled email/password form + "Try the demo" — the one UI change; everything else matches the prototype exactly.

## Consequences

- Design is a system, not a pile of classes — consistent, themeable, senior-grade.
- The mood orbs stay 5 (LOL/IDK map into Rad/Meh — ADR-0004), so the orb set is unchanged from the prototype.
- Any future theme change is a token edit, not a rewrite.
