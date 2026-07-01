#!/usr/bin/env node
// init-mcp-playwright.mjs — Playwright MCP 启动包装脚本（跨平台）
// 自动检查依赖、安装浏览器二进制、启动 MCP 服务器
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const isWin = process.platform === 'win32'

// 1. 定位 playwright-mcp 二进制
const binName = isWin ? 'playwright-mcp.cmd' : 'playwright-mcp'
const mcpBin = join(projectRoot, 'node_modules', '.bin', binName)

// 2. 未安装则自动安装
if (!existsSync(mcpBin)) {
  console.error('[playwright-mcp] Installing @playwright/mcp...')
  const usePnpm = existsSync(join(projectRoot, 'pnpm-lock.yaml'))
  const installCmd = usePnpm
    ? 'pnpm add -wD @playwright/mcp'
    : 'npm install -D @playwright/mcp'
  execSync(installCmd, { cwd: projectRoot, stdio: 'inherit' })
}

// 3. 启动 MCP 服务器（stdio 继承，opencode 通过 stdin/stdout 通信）
//    --isolated 模式：浏览器在工具调用时按需启动，无需预装 chromium
// 3. 清理僵尸进程（仅 Unix）
if (!isWin) {
  try { execSync("pkill -f 'ms-playwright/mcp-chrome'", { stdio: 'ignore' }) } catch {}
}

// 5. 启动 MCP 服务器（stdio 继承，opencode 通过 stdin/stdout 通信）
const child = spawn(mcpBin, ['--isolated'], { stdio: 'inherit' })
child.on('error', (err) => { console.error(err); process.exit(1) })
child.on('exit', (code) => process.exit(code ?? 1))