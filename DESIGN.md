# Cardinal — Design system

Committed identity (from the team's `08-design.md`; identity-preservation wins — do not
swap the palette). Tokens live in `src/styles/tokens.css`; shared components in
`src/components/primitives.tsx`.

## Color strategy: Restrained
Neutral cream surface + slate as the sole non-tier accent. Any other color MUST encode a
clinical tier. Tiers are functional, never decorative.

- Surface: page `#F4EFE6` cream · card `#FBF8F1` · sunken `= page` · border `#E0D6C0` (0.5px)
- Ink `#1A1714` · muted `#6B635A` (verified ≥4.5:1 on cream for body)
- Accent (slate): `#4F6E91` · fill `#EEF1F5` · chip `#E1E7F0` · text `#3E587A`
- Tiers: pass/green `#5E7B3F` on `#DCE6CC` · watch/amber `#B5872F` on `#F0E6CC` · admit/red `#A8553D` on `#EBD7CE`

## Type
- Display serif **Fraunces** (headings only) · body **system-ui** · **mono** for ALL
  numerics, labels, captions, and clinical data (the data IS the product).
- Product-register scale: fixed rem, ratio ~1.2. Weights 400/500 only. Sentence case for
  prose; short mono labels may be caps (they are data labels, not prose).

## Shape & elevation
- Cards 14px radius, pills 20px, insets 10–12px. **No shadows, no gradients.** Elevation is
  carried by 0.5px borders + the sunken/raised cream contrast only.
- **No side-stripe accents** (>1px colored left borders are banned). Status is carried by a
  full subtle tint on the header row, never a stripe.

## Motion (product: conveys state, 150–250ms)
- `--ease-out` exponential; `--dur-fast 160ms` / `--dur 220ms`. Gate expand, populate
  stagger, FHIR transfer, day-stepper. All gated behind `prefers-reduced-motion`.

## Signature components
- **Threshold ladder** — per signal, a 3-segment in/borderline/out scale with the patient's
  value marked on its segment. Makes "why 86" and "no single threshold breached" inspectable.
- **BandPill / TierDot** — tier = color + icon + word.
- **Sparkline** — inline SVG, baseline band shaded.
- **Decision state** — Accept/Override identical weight; once decided, lock to the logged
  audit line until a global Reset.
