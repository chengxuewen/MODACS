#!/usr/bin/env node
// init-lsp-wrap.mjs — LSP 命令包装器
// 用法: node init-lsp-wrap.mjs <command> [args...]
// 检查 LSP 服务器是否安装，未安装则自动安装，然后 spawn 服务器进程

import { execSync, spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

// Command → npm package mapping (for npm-installable LSPs)
const NPM_MAP = {
  'typescript-language-server': 'typescript-language-server',
  'pyright-langserver': 'pyright',
  'bash-language-server': 'bash-language-server',
  'vscode-html-language-server': 'vscode-langservers-extracted',
  'remark-language-server': 'remark-language-server',
}

function has(cmd) {
  try {
    execSync(`${isWin ? 'where' : 'command -v'} ${cmd}`, { stdio: 'ignore' })
    return true
  } catch { return false }
}

function ensureInstalled(cmd) {
  if (has(cmd)) return true

  // npm-based LSPs
  if (cmd in NPM_MAP) {
    const pkg = NPM_MAP[cmd]
    if (!has('npm')) {
      console.error(`[init-lsp-wrap] Cannot install ${pkg}: npm not found`)
      return false
    }
    console.error(`[init-lsp-wrap] Installing ${pkg} ...`)
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit' })
      if (has(cmd)) return true
    } catch {}
    console.error(`[init-lsp-wrap] Failed to install ${pkg}`)
    return false
  }

  // clangd — system install
  if (cmd === 'clangd') {
    if (isMac) {
      console.error('[init-lsp-wrap] clangd not found. Install Xcode Command Line Tools: xcode-select --install')
    } else if (isLinux && has('apt-get')) {
      try { execSync('sudo apt-get install -y clangd', { stdio: 'inherit' }); if (has('clangd')) return true } catch {}
    } else if (isLinux && has('dnf')) {
      try { execSync('sudo dnf install -y clang-tools-extra', { stdio: 'inherit' }); if (has('clangd')) return true } catch {}
    } else {
      console.error('[init-lsp-wrap] clangd not found. Please install LLVM/clangd manually.')
    }
    return false
  }

  // rust-analyzer — rustup
  if (cmd === 'rust-analyzer') {
    if (has('rustup')) {
      try { execSync('rustup component add rust-analyzer', { stdio: 'inherit' }); if (has('rust-analyzer')) return true } catch {}
    }
    console.error('[init-lsp-wrap] rust-analyzer not found. Install via: https://rustup.rs')
    return false
  }

  console.error(`[init-lsp-wrap] Unknown LSP command: ${cmd}`)
  return false
}

// --- Main ---
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node init-lsp-wrap.mjs <command> [args...]')
  process.exit(1)
}

const cmd = args[0]
const cmdArgs = args.slice(1)

if (!ensureInstalled(cmd)) {
  console.error(`[init-lsp-wrap] ${cmd} is not available. LSP will not start.`)
  process.exit(1)
}

// Spawn the LSP server, inheriting stdio for LSP protocol communication
const child = spawn(cmd, cmdArgs, { stdio: 'inherit' })

child.on('exit', (code) => {
  process.exit(code ?? 1)
})

child.on('error', (err) => {
  console.error(`[init-lsp-wrap] Failed to spawn ${cmd}:`, err.message)
  process.exit(1)
})
