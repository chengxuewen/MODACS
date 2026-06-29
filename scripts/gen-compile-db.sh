#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$PROJECT_DIR/build}"
OUTPUT="$PROJECT_DIR/compile_commands.json"

[ "${1:-}" = "--clean" ] && { rm -f "$OUTPUT"; echo "Removed $OUTPUT"; exit 0; }

fragments=""
while IFS= read -r -d '' f; do fragments+="$f"$'\n'; done < <(find "$BUILD_DIR" -maxdepth 4 -name compile_commands.json -print0 2>/dev/null || true)
if [ -z "$fragments" ]; then
    echo "No compile_commands.json found under $BUILD_DIR. Run colcon build first."
    exit 1
fi

echo "[" > "$OUTPUT"
first=true
while IFS= read -r f; do
    [ -z "$f" ] && continue
    count=$(python3 -c "import json;print(len(json.load(open('$f'))))" 2>/dev/null || echo 0)
    [ "$count" -eq 0 ] && continue
    echo "  $f ($count entries)"
    $first && first=false || echo "," >> "$OUTPUT"
    tail -n +2 "$f" | head -n -1 >> "$OUTPUT"
done <<< "$fragments"
echo "]" >> "$OUTPUT"

total=$(python3 -c "import json;print(len(json.load(open('$OUTPUT'))))")
echo "Done: $OUTPUT ($total total entries)"
