#!/usr/bin/env node
/* eslint-disable regexp/no-unused-capturing-group, regexp/no-super-linear-backtracking, regexp/no-useless-assertions */
/* eslint-disable no-console */
/**
 * 版本号自动 bump + changelog 追加脚本
 *
 * 手动用法：
 *   npm run release                         # 默认 bump patch (0.1.4 → 0.1.5)
 *   npm run release -- feat:新增xxx fix:修复xxx
 *   npm run release:minor
 *   npm run release:major
 *   node scripts/release.mjs --from-git-message --auto-commit
 *
 * 钩子自动用法（post-commit）：
 *   git commit -m "feat:新增标签"          → 自动 bump + commit
 *   git commit -m "fix:修复切歌错位"        → 自动 bump + commit
 *   git commit -m "chore:脚手架调整"         → 跳过（不 bump）
 *   git commit -m "chore(release): v0.1.5"  → 跳过（避免循环触发）
 *
 * 约定格式：类型:描述 或 类型：描述（中英文冒号都支持）
 *   类型：feat / fix / opt / docs / other
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PKG_PATH = resolve(ROOT, 'package.json')
const CHANGELOG_PATH = resolve(ROOT, 'src/constants/changelog.ts')

const args = process.argv.slice(2)
const fromGitMessage = args.includes('--from-git-message')
const autoCommit = args.includes('--auto-commit')
const dryRun = args.includes('--dry-run')
const level = args.find(a => ['patch', 'minor', 'major'].includes(a)) || 'patch'
const itemArgs = args.filter(a =>
  !['patch', 'minor', 'major', '--from-git-message', '--auto-commit', '--dry-run'].includes(a),
)

/** 读取最新一条 commit message */
function readLatestCommitMessage() {
  try {
    return execFileSync('git', ['log', '-1', '--pretty=%B'], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
  } catch {
    return ''
  }
}

/** 判断这条 commit 是否需要 bump 版本 */
function shouldBump(message) {
  const firstLine = message.split('\n')[0].trim()
  // release commit 自己不触发
  if (/^(chore\(release\)|release):/i.test(firstLine))
    return false
  // chore 类型（非 release）跳过
  if (/^chore[:(]/i.test(firstLine))
    return false
  // merge / revert / fixup / squash 等自动生成的 commit 跳过
  if (/^(Merge|Revert|Reapply|fixup!|squash!)\b/i.test(firstLine))
    return false
  // 空消息跳过
  if (!firstLine)
    return false
  return true
}

/** 从一整段 commit message 解析变更条目 */
function parseItemsFromMessage(message) {
  const lines = message.split('\n')
  const result = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line)
      continue
    // 跳过 Conventional Commits 的 footer 区块
    if (/^[A-Z-]+:/i.test(line) && line.length < 20)
      continue
    // 过滤 merge / revert / chore 等
    if (/^(Merge|Revert|chore|ci|style|perf|refactor)\b/i.test(line))
      continue
    const item = parseItem(line)
    if (item)
      result.push(item)
  }
  return result
}

/** 解析单行 item，支持 Conventional Commits 风格和中文风格 */
function parseItem(raw) {
  // Conventional Commits: type(scope)!: description
  const ccMatch = raw.match(/^(feat|fix|opt|docs|other|build|test)\b(?:\([^)]*\))?!?[:：]\s*(.+)$/i)
  if (ccMatch) {
    const type = ccMatch[1].toLowerCase()
    // build / test 归入 other
    const normalized = ['feat', 'fix', 'opt', 'docs'].includes(type) ? type : 'other'
    return { type: normalized, text: ccMatch[2].trim() }
  }
  // 中文前缀
  const cnMatch = raw.match(/^(新增|修复|优化|文档|其他)\s*(?:[：:]\s*)?(.+)$/)
  if (cnMatch) {
    const map = { 新增: 'feat', 修复: 'fix', 优化: 'opt', 文档: 'docs', 其他: 'other' }
    return { type: map[cnMatch[1]], text: cnMatch[2].trim() }
  }
  // 纯文本描述，不识别为 item（避免把无关内容带进去）
  return null
}

function bump(version, level) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ===== 入口 =====

let items = []

if (fromGitMessage) {
  const message = readLatestCommitMessage()
  if (!message) {
    console.log('  (无 commit message，跳过 bump)')
    process.exit(0)
  }
  if (!shouldBump(message)) {
    console.log(`  (commit "${message.split('\n')[0]}" 不需 bump，跳过)`)
    process.exit(0)
  }
  items = parseItemsFromMessage(message)
  if (!items.length) {
    // commit message 里没提取到明确条目，把第一行兜底
    items = [{ type: 'other', text: message.split('\n')[0].trim() }]
  }
} else {
  items = itemArgs.length
    ? itemArgs.map(parseItem).filter(Boolean)
    : [{ type: 'other', text: '在此填写本次更新内容' }]
}

if (!items.length) {
  console.log('  (无有效条目，跳过 bump)')
  process.exit(0)
}

// 1. bump package.json
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'))
const oldVersion = pkg.version
const newVersion = bump(oldVersion, level)

if (dryRun) {
  console.log(`  [dry-run] ${oldVersion} → ${newVersion}`)
  console.log(`  [dry-run] items:`)
  items.forEach(it => console.log(`    - ${it.type}: ${it.text}`))
  process.exit(0)
}

pkg.version = newVersion
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`  package.json: ${oldVersion} → ${newVersion} (${level})`)

// 2. 读取 changelog.ts，在 CHANGELOG 数组首项前插入新版本
const changelogSrc = readFileSync(CHANGELOG_PATH, 'utf-8')

const newEntry = `  {
    version: '${newVersion}',
    date: '${formatDate(new Date())}',
    items: [
${items.map(item => `      { type: '${item.type}', text: '${item.text.replace(/'/g, '\\\'')}' },`).join('\n')}
    ],
  },`

const nextSrc = changelogSrc.replace(
  /(export const CHANGELOG: ChangelogEntry\[\] = \[)\s*\n/,
  `$1\n${newEntry}\n`,
)

if (nextSrc === changelogSrc) {
  console.error('✗ 无法定位 CHANGELOG 数组，脚本未修改 changelog.ts')
  process.exit(1)
}

writeFileSync(CHANGELOG_PATH, nextSrc)
console.log(`  changelog.ts: 已追加 v${newVersion}`)

// 3. 可选自动 commit（供 git 钩子触发时使用，--no-verify 避免循环触发 post-commit）
if (autoCommit) {
  try {
    execFileSync('git', ['add', 'package.json', 'src/constants/changelog.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    execFileSync(
      'git',
      ['commit', '--no-verify', '-m', `chore(release): v${newVersion}`],
      { cwd: ROOT, stdio: 'inherit' },
    )
    console.log(`\n✓ 已自动提交 release commit`)
  } catch (err) {
    console.error(`\n✗ 自动提交失败：${err.message}`)
    console.log(`  请手动执行：git add package.json src/constants/changelog.ts && git commit -m "release: v${newVersion}"`)
    process.exit(1)
  }
} else {
  console.log(`\n✓ 版本更新完成`)
  console.log(`  git add package.json src/constants/changelog.ts`)
  console.log(`  git commit -m "release: v${newVersion}"`)
}
