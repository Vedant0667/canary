#!/usr/bin/env python3
"""
.claude/hooks/detect-correction.py
Stop hook: scans the last few user messages for correction signals. If found
AND the assistant hasn't already appended to tasks/lessons.md in this turn,
blocks Stop and re-prompts Claude to write a lesson before truly ending.

Exits:
  0 — no correction, or lesson already written → allow Stop
  2 — correction detected, lesson missing → block Stop, re-feed stdout to Claude
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Conservative correction patterns. False positives are annoying; false negatives are fine.
# Each pattern is a regex anchored on word boundaries so we don't fire on "innocent" tokens.
CORRECTION_PATTERNS = [
    r"\b(no|nope)\b.*\b(don'?t|stop|wrong)\b",
    r"\bthat'?s (not|wrong|incorrect)\b",
    r"\byou'?re (wrong|incorrect)\b",
    r"\bur (wrong|trolling)\b",
    r"\bstop (doing|making|trying)\b",
    r"\bbro\b.*(wrong|trolling|cmon|come on|fix)",
    r"\bcome on\b.*\b(wrong|broken|fix)\b",
    r"\bdoesn'?t work\b",
    r"\b(broken|broke it)\b",
    r"\brevert\b",
    r"\bfix (this|that)\b",
    r"\bthat'?s (bs|bull(shit)?)\b",
]
PATTERNS = [re.compile(p, re.IGNORECASE) for p in CORRECTION_PATTERNS]

def extract_text(content):
    """User message content can be str OR list of blocks. Concat all text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict):
                # Skip tool_result blocks — those are system data, not user-typed
                if b.get("type") == "tool_result":
                    continue
                if b.get("type") == "text":
                    parts.append(str(b.get("text", "")))
                elif "text" in b:
                    parts.append(str(b["text"]))
        return "\n".join(parts)
    return ""

def main():
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)

    # Avoid infinite loops — if this hook already fired and re-invoked Claude, don't fire again.
    if payload.get("stop_hook_active"):
        sys.exit(0)

    transcript_path = payload.get("transcript_path")
    if not transcript_path or not Path(transcript_path).is_file():
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    lessons_path = Path(project_dir) / "tasks" / "lessons.md"

    # Read the transcript. Scan the last 30 messages for user corrections.
    user_messages = []
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                msg = rec.get("message", {})
                if not isinstance(msg, dict):
                    continue
                if msg.get("role") != "user":
                    continue
                # Skip records that are pure tool_result feedback
                content = msg.get("content")
                text = extract_text(content).strip()
                if not text:
                    continue
                user_messages.append(text)
    except Exception:
        sys.exit(0)

    if not user_messages:
        sys.exit(0)

    # Only consider the last ~8 user messages — older corrections shouldn't keep firing.
    recent = "\n\n".join(user_messages[-8:])

    matched = None
    for pat in PATTERNS:
        m = pat.search(recent)
        if m:
            matched = m.group(0)
            break

    if not matched:
        sys.exit(0)

    # Did the assistant already write a new lesson recently? Three places to check:
    #   1. Unstaged diff of tasks/lessons.md     (just-edited, not staged)
    #   2. Staged diff of tasks/lessons.md       (staged, not committed)
    #   3. Recent commits touching tasks/lessons.md (committed in this session)
    # If any contains a new dated [YYYY-MM-DD] entry, allow stop.
    try:
        diff = subprocess.run(
            ["git", "-C", project_dir, "diff", "--unified=0", "tasks/lessons.md"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        diff_staged = subprocess.run(
            ["git", "-C", project_dir, "diff", "--cached", "--unified=0", "tasks/lessons.md"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        dated_re = re.compile(r"^\+\[\d{4}-\d{2}-\d{2}\]", re.MULTILINE)
        if dated_re.search(diff) or dated_re.search(diff_staged):
            sys.exit(0)

        # Check recent commits in the last 30 minutes for lessons.md changes.
        # Use `git log -p` so we can verify a +date line was actually added (not just any touch).
        recent_log = subprocess.run(
            ["git", "-C", project_dir, "log", "--since=30 minutes ago", "-p", "--", "tasks/lessons.md"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        if dated_re.search(recent_log):
            sys.exit(0)
    except Exception:
        pass  # If git isn't available, fall through to blocking.

    # Block Stop and re-feed Claude.
    print(
        f"Retrospective hook: user correction detected in recent messages "
        f"(matched pattern: {matched!r}). "
        f"Before stopping, append a new dated entry to {lessons_path.relative_to(project_dir)} "
        f"following the project format: `[YYYY-MM-DD] | what went wrong | rule to prevent it`. "
        f"Then end the turn.",
        file=sys.stderr,
    )
    sys.exit(2)

if __name__ == "__main__":
    main()
