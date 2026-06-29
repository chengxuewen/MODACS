#!/bin/bash

if [ -n "$BASH_SOURCE" ]; then
    SCRIPT_PATH="$BASH_SOURCE"
elif [ -n "$ZSH_VERSION" ]; then
    SCRIPT_PATH="${(%):-%x}"
else
    SCRIPT_PATH="$0"
fi
[ -z "$SCRIPT_PATH" ] && SCRIPT_PATH="$0"
if __dir="$(cd -- "$(dirname -- "$SCRIPT_PATH" 2>/dev/null)" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
elif __dir="$(cd -- "$(dirname -- "$0")" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
else
    SCRIPT_DIR="$(pwd -P 2>/dev/null || echo "/tmp")"
fi
PWD_DIR="$(pwd)"

TMP_RCFILE=$(mktemp)
trap 'rm -f "$TMP_RCFILE"' EXIT
cat > "$TMP_RCFILE" <<EOF
export PS1="(ms_rcs) \$PS1"

echo "run ${SCRIPT_DIR}/install.sh..."
bash "${SCRIPT_DIR}/install.sh"
echo "source ${SCRIPT_DIR}/env-source.sh..."
source "${SCRIPT_DIR}/env-source.sh"

rm -f "$TMP_RCFILE"
EOF

exec bash --rcfile "$TMP_RCFILE"
