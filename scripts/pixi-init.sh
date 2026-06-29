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
# fail fast: propagate errors to calling scripts
set -euo pipefail

arg_root_dir="$(realpath "${SCRIPT_DIR}/..")"
while [ $# -gt 0 ]; do
    case "$1" in
        --root-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_root_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid root dir."
                exit 1
            fi
            ;;
        *)
            echo "Error: Unknown parameter $1"
            exit 1
            ;;
    esac
done

PIXI_ARCH=$(uname -m)
export PIXI_VERSION="0.67.2"
export PATH="$HOME/.pixi/bin:$PATH"
NEED_INSTALL=false
if command -v pixi >/dev/null 2>&1; then
    CURRENT_PIXI_VERSION=$(pixi --version 2>/dev/null | grep -oP 'pixi \K[0-9.]+' || echo "unknown")
    if [ "${CURRENT_PIXI_VERSION}" = "${PIXI_VERSION}" ]; then
        echo "[INFO] pixi ${PIXI_VERSION} is already installed"
    else
        echo "[INFO] pixi version mismatch (installed: ${CURRENT_PIXI_VERSION:-unknown}, required: ${PIXI_VERSION}), reinstalling..."
        NEED_INSTALL=true
    fi
else
    echo "[INFO] pixi not installed, installing pixi ${PIXI_VERSION}..."
    NEED_INSTALL=true
fi

if [ "${NEED_INSTALL}" = "true" ]; then
    export PIXI_REPOURL="https://gitee.com/chengxuewen-github/pixi"
    bash "${SCRIPT_DIR}/pixi-install.sh"
    if [ $? -ne 0 ]; then
        echo "[ERROR] pixi installation failed"
        exit 1
    fi
    if [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    fi
    # Re-export PATH after reinstall
    export PATH="$HOME/.pixi/bin:$PATH"
fi

# install platform dependency packages
arg_root_dir="${arg_root_dir:-$SCRIPT_DIR}"
# export CONDA_OVERRIDE_GLIBC=2.28
export PIXI_CACHE_DIR=${arg_root_dir}/.pixi-cache
echo "Enter pixi environment dir ${arg_root_dir}..."
cd "${arg_root_dir}" || { echo "Unable to enter directory: ${arg_root_dir}"; exit 1; }
echo "Start pixi lock..."
pixi lock || { echo "[ERROR] pixi lock failed"; exit 1; }
echo "Start pixi install..."
pixi install --use-environment-activation-cache || { echo "[ERROR] pixi install failed"; exit 1; }
if command -v pixi-pack >/dev/null 2>&1; then
    echo "Checked pixi-pack has been installed"
else
    echo "Checked pixi-pack has not installed, start install pixi-pack..."
    pixi global install pixi-pack || { echo "[ERROR] pixi-pack installation failed"; exit 1; }
fi
PIXI_PACK_VERSION=$(pixi-pack --version 2>/dev/null | awk '{print $2}') || { echo "[ERROR] pixi-pack version check failed"; exit 1; }

os="$(uname -s)"
case "$os" in
    Darwin)  PIXI_OS="apple-darwin" ;;
    Linux)   PIXI_OS="unknown-linux-musl" ;;
esac

# Install/verify pixi-unpack-tool
PIXI_UNPACK="$HOME/.pixi/bin/pixi-unpack-tool"
if [ -x "${PIXI_UNPACK}" ] && [ -s "${PIXI_UNPACK}" ]; then
    PIXI_UNPACK_VERSION=$(${PIXI_UNPACK} --version 2>/dev/null | awk '{print $2}')
    echo "pixi-unpack-tool version: ${PIXI_UNPACK_VERSION}"
else
    PIXI_UNPACK_VERSION=""
fi

if [ "${PIXI_PACK_VERSION}" != "${PIXI_UNPACK_VERSION}" ] || [ ! -s "${PIXI_UNPACK}" ]; then
    echo "[INFO] Installing pixi-unpack-tool ${PIXI_PACK_VERSION}..."
    # PIXI_PACK_BASE_URL="https://gitee.com/chengxuewen-github/pixi-pack/releases/download"
    PIXI_PACK_BASE_URL="https://github.com/Quantco/pixi-pack/releases/download"
    PIXI_UNPACK_TOOL_URL="${PIXI_PACK_BASE_URL}/v${PIXI_PACK_VERSION}/pixi-unpack-${PIXI_ARCH}-${PIXI_OS}"
    echo "[INFO] Downloading ${PIXI_UNPACK_TOOL_URL}..."
    if ! wget -O "${PIXI_UNPACK}" "${PIXI_UNPACK_TOOL_URL}"; then
        echo "[ERROR] Failed to download pixi-unpack-tool from ${PIXI_UNPACK_TOOL_URL}" >&2
        exit 1
    fi
    chmod +x "${PIXI_UNPACK}"
    if [ ! -s "${PIXI_UNPACK}" ]; then
        echo "[ERROR] Downloaded pixi-unpack-tool is empty" >&2
        exit 1
    fi
    echo "[INFO] pixi-unpack-tool installed successfully"
fi

echo "Start pixi run pnpm install..."
pixi run pnpm install || { echo "[ERROR] pnpm install failed"; exit 1; }
