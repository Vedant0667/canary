#!/usr/bin/env bash
# .claude/hooks/load-lessons.sh
# SessionStart hook: prints tasks/lessons.md so Claude has every prior lesson
# in context from turn 0. CLAUDE.md says "read lessons.md first" — this enforces
# it mechanically instead of relying on Claude to remember.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LESSONS="$PROJECT_DIR/tasks/lessons.md"
TODO="$PROJECT_DIR/tasks/todo.md"

if [ -f "$LESSONS" ]; then
  echo "## Auto-loaded: tasks/lessons.md"
  echo "_(Hook injects this every session. Apply these lessons before touching anything.)_"
  echo
  cat "$LESSONS"
  echo
fi

if [ -f "$TODO" ]; then
  echo "## Auto-loaded: tasks/todo.md (head)"
  echo
  head -50 "$TODO"
  echo
  echo "_(Tail truncated — read the full file if needed.)_"
fi
