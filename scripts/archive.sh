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
PWD_DIR_NAME="$(basename "${SCRIPT_DIR}")"
PWD_DIR="$(pwd)"

arg_archive_name="${PWD_DIR_NAME}"
arg_output_dir="$(realpath "${SCRIPT_DIR}/..")"
while [ $# -gt 0 ]; do
    case "$1" in
        --archive-name)
            if [ -n "$2" ]; then
                arg_archive_name="$2"
                shift 2
            else
                echo "Error: Invalid archive name."
                exit 1
            fi
            ;;
        --output-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2" || { echo "Error: Cannot create output dir: $2"; exit 1; }
                arg_output_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid output dir."
                exit 1
            fi
            ;;
        *)
            echo "Error: Unknown parameter $1"
            exit 1
            ;;
    esac
done

temp_dir=$(mktemp -d)
cp -r "${SCRIPT_DIR}" "${temp_dir}/${arg_archive_name}"
tar -czvf "${arg_output_dir}/${arg_archive_name}.tar.gz" \
    --exclude="env" \
    --exclude="log" \
    --exclude="data" \
    --exclude="storage" \
    --exclude="node_modules" \
    --exclude="activate.sh" \
    -C "${temp_dir}" "${arg_archive_name}"
rm -rf "${temp_dir}"