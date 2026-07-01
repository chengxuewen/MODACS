#!/usr/bin/env node
// init-mcp-codegraph.mjs — CodeGraph MCP 启动包装脚本（跨平台）
// 自动探测 Node.js 环境、启动 codegraph MCP 服务器
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const isWin = process.platform === 'win32'

// 1. 定位 codegraph 二进制
const binName = isWin ? 'codegraph.cmd' : 'codegraph'
const codegraphBin = join(projectRoot, 'node_modules', '.bin', binName)

// 2. 未安装则自动安装
if (!existsSync(codegraphBin)) {
  console.error('[codegraph] Installing @colbymchenry/codegraph...')
  const usePnpm = existsSync(join(projectRoot, 'pnpm-lock.yaml'))
  const installCmd = usePnpm
    ? 'pnpm add -wD @colbymchenry/codegraph'
    : 'npm install -D @colbymchenry/codegraph'
  execSync(installCmd, { cwd: projectRoot, stdio: 'inherit' })
}

// 3. 启动 MCP 服务器
const child = spawn(codegraphBin, ['serve', '--mcp'], { stdio: 'inherit' })
child.on('error', (err) => { console.error(err); process.exit(1) })
child.on('exit', (code) => process.exit(code ?? 1))