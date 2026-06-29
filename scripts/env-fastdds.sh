#!/bin/bash
# ============================================================
# env-fastdds.sh — 在 pixi 环境中启用 Fast-DDS + SHM 共享内存
#
# 用法:
#   source scripts/env-fastdds.sh
#
# 该脚本必须在 pixi 环境激活后执行（通过 pixi shell 或 pixi run）。
# 它会设置 RMW 为 Fast-DDS，并配置 SHM 共享内存传输。
# ============================================================

# 获取脚本所在目录的绝对路径（兼容 bash/zsh）
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
else
    SCRIPT_DIR="$(pwd -P 2>/dev/null || echo "/tmp")"
fi

PROJECT_DIR="$(realpath "${SCRIPT_DIR}/..")"

# 1. 设置默认 RMW 为 Fast-DDS
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp

# 2. 设置 Fast-DDS XML 配置文件（SHM 共享内存）
export FASTRTPS_DEFAULT_PROFILES_FILE="${PROJECT_DIR}/config/fastdds_shm.xml"

echo "[env-fastdds] RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION}"
echo "[env-fastdds] FASTRTPS_DEFAULT_PROFILES_FILE=${FASTRTPS_DEFAULT_PROFILES_FILE}"
echo "[env-fastdds] Fast-DDS SHM 环境已就绪"
