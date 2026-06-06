# Lessons

## Format: [date] | what went wrong | rule to prevent it

---

<!-- Entries get appended here as the project evolves. The Stop hook
(.claude/hooks/detect-correction.py) automatically blocks session-end
when a user correction is detected without a new entry. -->

2026-06-05 | Bash shell cwd is unstable between calls here (resets to ~ mid-session); relative `perl -pi`/`grep` silently hit wrong/missing files | For multi-file edits, drive from absolute paths (or a Python script with absolute Path), and always verify with a follow-up grep count rather than trusting exit status.

2026-06-05 | "Not hardcoded" for an AI demo means a judge can feed NEW input and watch it work | Always provide a live, no-cache path for arbitrary user input (paste-a-note → real model call → real engine), and keep provenance honest (live vs cached badge that tells the truth). A deterministic rules engine is NOT "hardcoded" — it computes from inputs; say so explicitly.

2026-06-05 | detect-correction Stop hook false-fired on EVERY turn (5x+) on the claude-api SKILL docs, which land in the transcript as USER-role records containing "no target file ... If you find any, stop" — tripping the `\bno\b.*\bstop\b` regex. Worse, the hook's own feedback echoes the matched pattern back into the transcript, so it self-perpetuated. Root cause: it scanned ALL role=user records, skipping only `tool_result`, not harness-injected context. FIXED 2026-06-05: verified via transcript inspection that injected content (skill docs, SessionStart output, the hook's own feedback) all carry top-level `isMeta:true`, and tool results carry `toolUseResult`, whereas genuine typed prompts have neither. Hook now `continue`s on `isMeta`/`toolUseResult` records, strips `<system-reminder>` blocks, and ignores the "[Request interrupted by user]" sentinel. Tested: no false fire on the real transcript, and a genuine "no that's wrong, stop" is still caught. | When a Stop/PostToolUse hook scans the transcript, filter to genuinely user-typed turns (`isMeta` falsy AND no `toolUseResult`) before pattern-matching — harness-injected skill/system/hook-feedback records are role=user too and will self-trigger correction detectors.

2026-06-05 | Shipped "Generate a patient" but its failure path set `customError` that only rendered inside the PasteIntake card — which auto-collapses after generation. So when the live call failed, the user got dumped on the blank "Select a packet" state with no error, no spinner, nothing ("doesnt work, stops here"). The call itself was fine (verified key/model/CORS all return 200 from a browser-shaped request); the bug was a hidden failure state. | Async/live-call failure states must render in a PRIMARY, always-visible location, never buried in a component that can collapse or unmount. Every async action needs three visible states: loading, success, AND error. Also log live failures to console for diagnosis. When a user says a live feature "doesn't work," verify the call independently (curl the API with their key + a browser-shaped CORS request) BEFORE assuming the call is broken — it's often a hidden-error or stale-client-state UX bug, not the API.
