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

unset PYTHONPATH
unset LD_LIBRARY_PATH

cd "${SCRIPT_DIR}" || { echo "Unable to enter directory: ${SCRIPT_DIR}"; exit 1; }
if [ -f "${SCRIPT_DIR}/environment.sh" ]; then
    echo "Running ${SCRIPT_DIR}/environment.sh..."
    bash "${SCRIPT_DIR}/environment.sh"
else
    echo "❌ ${SCRIPT_DIR}/environment.sh does not exist!"
    exit 1
fi

if [ -f "${SCRIPT_DIR}/activate.sh" ]; then
    echo "source ${SCRIPT_DIR}/activate.sh..."
    source "${SCRIPT_DIR}/activate.sh"
else
    echo "❌ ${SCRIPT_DIR}/activate.sh does not exist!"
    exit 1
fi

cd "${SCRIPT_DIR}" || { echo "Unable to enter directory: ${SCRIPT_DIR}"; exit 1; }
npm_tar_files=(*_node_modules.tar.gz)
if [[ ! -e "${npm_tar_files[0]}" ]]; then
    echo "❌ node_modules tar.gz not found!"
    exit 1
fi

echo "🔍 Found the following npm dependency packages:"
for f in "${npm_tar_files[@]}"; do
    echo "   - $f"
done
echo ""

# Extract node_modules
npm_tar_file="${npm_tar_files[0]}"
echo "📦 Extracting npm dependencies: ${npm_tar_file} ..."

if tar -xzf "${npm_tar_file}" -C "${SCRIPT_DIR}"; then
    echo "✅ npm dependencies extracted successfully"
else
    echo "❌ Failed to extract npm dependencies: ${npm_tar_file}"
    exit 1
fi

echo "source ${SCRIPT_DIR}/env-source.sh..."
source "${SCRIPT_DIR}/env-source.sh"