#!/usr/bin/env bash
# install-lsp.sh — 安装/检查 OpenCode 所需的 LSP 服务器
#
# 用法: bash scripts/install-lsp.sh
#
# 此脚本检测 opencode.json 中配置的所有 LSP 服务器，
# 缺失的自动安装，已安装的跳过。可安全重复执行（幂等）。
#
# LSP 列表（对应 .opencode/opencode.json 的 lsp 配置）:
#   npm 安装:  typescript-language-server, pyright, bash-language-server,
#              vscode-langservers-extracted, remark-language-server
#   工具链:    clangd (macOS 自带 / Linux apt), rust-analyzer (rustup)

set -euo pipefail

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️${NC}  $1"; }
fail()  { echo -e "${RED}❌${NC} $1"; }
info()  { echo -e "${BLUE}ℹ️${NC}  $1"; }

# ─── 计数器 ───
INSTALLED=0
SKIPPED=0
FAILED=0

# ─── 工具函数 ───

# 检查命令是否存在
has() { command -v "$1" &>/dev/null; }

# 通过 npm 全局安装包（如果尚未安装）
# 用法: install_npm <check_cmd> <npm_package>
install_npm() {
  local check_cmd="$1"
  local package="$2"

  if has "$check_cmd"; then
    ok "$check_cmd 已安装"
    ((SKIPPED++))
    return 0
  fi

  if ! has npm; then
    fail "$package 安装失败: npm 未找到，请先安装 Node.js"
    ((FAILED++))
    return 1
  fi

  info "安装 $package ..."
  if npm install -g "$package" 2>&1 | tail -3; then
    hash -r 2>/dev/null || true
    if has "$check_cmd"; then
      ok "$check_cmd 安装成功"
      ((INSTALLED++))
    else
      fail "$package 安装后 $check_cmd 仍不可用（检查 PATH）"
      ((FAILED++))
      return 1
    fi
  else
    fail "$package 安装失败"
    ((FAILED++))
    return 1
  fi
}

# ─── 检测包管理器 ───
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  LSP 服务器安装/检查脚本${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# 检测 Node.js/npm
if has node; then
  info "Node.js: $(node --version) at $(command -v node)"
else
  warn "Node.js 未安装 — npm 类 LSP 将无法安装"
fi

if has npm; then
  info "npm: $(npm --version) at $(command -v npm)"
else
  warn "npm 未安装"
fi

echo ""

# ─── 1. TypeScript Language Server ───
echo -e "${BLUE}── TypeScript / JavaScript ──${NC}"
install_npm typescript-language-server typescript-language-server

# ─── 2. Pyright (Python LSP) ───
echo ""
echo -e "${BLUE}── Python ──${NC}"
install_npm pyright-langserver pyright

# ─── 3. Bash Language Server ───
echo ""
echo -e "${BLUE}── Bash ──${NC}"
install_npm bash-language-server bash-language-server

# ─── 4. HTML Language Server ───
echo ""
echo -e "${BLUE}── HTML ──${NC}"
install_npm vscode-html-language-server vscode-langservers-extracted

# ─── 5. Markdown Language Server ───
echo ""
echo -e "${BLUE}── Markdown ──${NC}"
install_npm remark-language-server remark-language-server

# ─── 6. clangd (C/C++ LSP) ───
echo ""
echo -e "${BLUE}── C/C++ (clangd) ──${NC}"
if has clangd; then
  ok "clangd 已安装: $(clangd --version 2>&1 | head -1)"
  ((SKIPPED++))
else
  case "$(uname -s)" in
    Darwin)
      warn "clangd 未找到。macOS 上随 Xcode Command Line Tools 安装:"
      info "  xcode-select --install"
      ((FAILED++))
      ;;
    Linux)
      if has apt-get; then
        info "尝试: sudo apt-get install -y clangd"
        if sudo apt-get install -y clangd 2>&1 | tail -3; then
          hash -r 2>/dev/null || true
          has clangd && ok "clangd 安装成功" && ((INSTALLED++)) || { fail "clangd 安装后仍不可用"; ((FAILED++)); }
        else
          fail "clangd 安装失败"
          ((FAILED++))
        fi
      elif has dnf; then
        info "尝试: sudo dnf install -y clang-tools-extra"
        if sudo dnf install -y clang-tools-extra 2>&1 | tail -3; then
          hash -r 2>/dev/null || true
          has clangd && ok "clangd 安装成功" && ((INSTALLED++)) || { fail "clangd 安装后仍不可用"; ((FAILED++)); }
        else
          fail "clangd 安装失败"
          ((FAILED++))
        fi
      else
        fail "无法识别的 Linux 包管理器，请手动安装 clangd"
        ((FAILED++))
      fi
      ;;
    *)
      fail "不支持的操作系统: $(uname -s)"
      ((FAILED++))
      ;;
  esac
fi

# ─── 7. rust-analyzer (Rust LSP) ───
echo ""
echo -e "${BLUE}── Rust ──${NC}"
if has rust-analyzer; then
  ok "rust-analyzer 已安装: $(rust-analyzer --version 2>&1 | head -1)"
  ((SKIPPED++))
elif has rustup; then
  info "通过 rustup 安装 rust-analyzer ..."
  if rustup component add rust-analyzer 2>&1 | tail -3; then
    hash -r 2>/dev/null || true
    if has rust-analyzer; then
      ok "rust-analyzer 安装成功"
      ((INSTALLED++))
    else
      fail "rust-analyzer 安装后仍不可用（检查 ~/.cargo/bin 是否在 PATH 中）"
      ((FAILED++))
    fi
  else
    fail "rust-analyzer 安装失败"
    ((FAILED++))
  fi
else
  fail "rust-analyzer 未找到且 rustup 未安装。请访问 https://rustup.rs 安装 Rust 工具链"
  ((FAILED++))
fi

# ─── 汇总 ───
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  汇总${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}已安装:${NC} $INSTALLED"
echo -e "  ${GREEN}已就绪:${NC} $SKIPPED"
if [ "$FAILED" -gt 0 ]; then
  echo -e "  ${RED}失败:${NC}   $FAILED"
fi
echo ""

if [ "$FAILED" -gt 0 ]; then
  warn "部分 LSP 安装失败，请检查上方输出"
  exit 1
else
  ok "所有 LSP 服务器就绪！"
  info "重启 OpenCode 会话以激活 LSP"
  exit 0
fi