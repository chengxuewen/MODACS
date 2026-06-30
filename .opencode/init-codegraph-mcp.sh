#!/usr/bin/env bash
# codegraph-mcp.sh — CodeGraph MCP 启动包装脚本
# 自动探测 Node.js 环境（nvm / brew / 直装），启动 codegraph MCP 服务器
# 用法: 在 opencode.json 中作为 MCP command 使用
set -euo pipefail

# 1. 探测 Node.js 环境
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # nvm 环境
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  exec npx -y @colbymchenry/codegraph serve --mcp
elif command -v npx &>/dev/null; then
  # 直装或 brew 安装
  exec npx -y @colbymchenry/codegraph serve --mcp
else
  echo "ERROR: Node.js/npx not found. Install via nvm or brew install node" >&2
  exit 1
fi