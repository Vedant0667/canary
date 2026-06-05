# Lessons

## Format: [date] | what went wrong | rule to prevent it

---

<!-- Entries get appended here as the project evolves. The Stop hook
(.claude/hooks/detect-correction.py) automatically blocks session-end
when a user correction is detected without a new entry. -->

2026-06-05 | Bash shell cwd is unstable between calls here (resets to ~ mid-session); relative `perl -pi`/`grep` silently hit wrong/missing files | For multi-file edits, drive from absolute paths (or a Python script with absolute Path), and always verify with a follow-up grep count rather than trusting exit status.

2026-06-05 | "Not hardcoded" for an AI demo means a judge can feed NEW input and watch it work | Always provide a live, no-cache path for arbitrary user input (paste-a-note → real model call → real engine), and keep provenance honest (live vs cached badge that tells the truth). A deterministic rules engine is NOT "hardcoded" — it computes from inputs; say so explicitly.
