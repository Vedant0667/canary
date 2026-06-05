#!/usr/bin/env bash
# .claude/hooks/typecheck.sh
# PostToolUse(Edit|Write) hook: runs `tsc --noEmit` if the just-edited file is
# .ts/.tsx. Catches type errors at edit time instead of at deploy time.
# Non-blocking — prints errors to stderr but exits 0 so Claude can continue.
# (Switch to exit 2 if you want it to be blocking.)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Read the hook payload from stdin to know which file was touched.
input=$(cat)

# Extract the file path from the tool input. Edit + Write both put it under tool_input.file_path.
file_path=$(echo "$input" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")

# Only run typecheck for TypeScript files.
case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Don't typecheck files inside worker/ from the root tsconfig (worker has its own).
case "$file_path" in
  */worker/*)
    # Run the worker's own tsc instead.
    if [ -f "$PROJECT_DIR/worker/tsconfig.json" ]; then
      cd "$PROJECT_DIR"
      output=$(npx tsc -p worker/tsconfig.json --noEmit 2>&1 || true)
    else
      exit 0
    fi
    ;;
  *)
    cd "$PROJECT_DIR"
    output=$(npx tsc --noEmit 2>&1 || true)
    ;;
esac

# If output is non-empty, surface it to Claude via stderr so it's visible in the
# turn. Cap at 30 lines to avoid context bloat.
if [ -n "$output" ]; then
  echo "── typecheck after edit ($file_path) ──" >&2
  echo "$output" | head -30 >&2
fi
exit 0
