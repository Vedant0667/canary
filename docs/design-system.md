# Cardinal — Design System

Source: `~/Downloads/-design-system.pdf` (provided by the team, 2026-06-05).

## 01 / Color

| Name  | Hex       | Role                |
|-------|-----------|---------------------|
| Cream | `#F4EFE6` | Background          |
| Ink   | `#1A1714` | Text · Solid        |
| Stone | `#6B635A` | Muted text          |
| Slate | `#4F6E91` | Co-accent · cool    |

Functional clinical-tier colors (pass / watch / admit) are an app-level extension,
kept muted and earthy so they harmonize with Cream and never compete with Slate.

## 02 / Typography

Two families plus mono. **No italics anywhere.**

- **Display** — Recoleta, weight 500, 56–240pt. Wordmark + hero headlines.
  License: Latinotype / Adobe. **Fallback used here: Fraunces (variable, soft 100).**
- **Body** — Suisse Int'l, Regular & Medium, 15–40pt. Headlines, body, UI.
  License: Swiss Typefaces / Adobe. **Fallback used here: Geist.**
- **Mono** — Geist Mono, Regular & Medium, 11–14pt. Labels, captions, status text.
  License: free (SIL OFL). Used directly.

Recoleta and Suisse are commercial; Cardinal ships their named free fallbacks
(Fraunces, Geist) bundled via `@fontsource`, so the demo renders identically
offline with no licensing exposure.

## 03 / Notes
- No italics. Upright across the system.
- Cream background as default. Pure white reads too clinical.
