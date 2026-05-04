#!/usr/bin/env node
// `tsops-skill install` — copy the bundled tsops Claude Skill into
// either `~/.claude/skills/tsops` (user scope, default) or
// `<cwd>/.claude/skills/tsops` (project scope, with `--project`).
//
// Idempotent: re-running overwrites existing files. Refuses to delete
// unrelated content under the target directory.

import { cp, mkdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { argv, cwd, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(__dirname, '..')
const SKILL_SRC = join(PKG_DIR, 'skill')
const SKILL_NAME = 'tsops'

function parseArgs(args) {
  const out = { command: 'install', scope: 'user', force: false, help: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === 'install' || arg === 'uninstall' || arg === 'where') {
      out.command = arg
    } else if (arg === '--project' || arg === '-p') {
      out.scope = 'project'
    } else if (arg === '--user' || arg === '-u') {
      out.scope = 'user'
    } else if (arg === '--force' || arg === '-f') {
      out.force = true
    } else if (arg === '--help' || arg === '-h') {
      out.help = true
    } else {
      console.error(`Unknown argument: ${arg}`)
      out.help = true
    }
  }
  return out
}

function targetDir(scope) {
  const base = scope === 'project' ? cwd() : homedir()
  return join(base, '.claude', 'skills', SKILL_NAME)
}

function help() {
  console.log(`tsops-skill — install the tsops Claude Skill

Usage:
  tsops-skill install [--user | --project] [--force]
  tsops-skill uninstall [--user | --project]
  tsops-skill where [--user | --project]

Options:
  --user, -u      Install into ~/.claude/skills/tsops  (default)
  --project, -p   Install into ./.claude/skills/tsops  (commit to repo)
  --force, -f     Overwrite without prompting
  --help, -h      Show this help

After install, restart Claude Code (or any Agent SDK session) so the skill
is picked up. Verify with: claude /skills
`)
}

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readSkillVersion() {
  const pkgJson = JSON.parse(await readFile(join(PKG_DIR, 'package.json'), 'utf8'))
  return pkgJson.version
}

async function install({ scope, force }) {
  const dst = targetDir(scope)
  const version = await readSkillVersion()

  if (!(await exists(SKILL_SRC))) {
    console.error(`Bundled skill source missing: ${SKILL_SRC}`)
    console.error(`This package is broken — please file an issue.`)
    exit(2)
  }

  if ((await exists(dst)) && !force) {
    console.log(`Skill already present at ${dst}`)
    console.log(`Re-run with --force to overwrite.`)
    exit(0)
  }

  await mkdir(dst, { recursive: true })
  await cp(SKILL_SRC, dst, { recursive: true, force: true })

  console.log(`✅ Installed @tsops/skill@${version} → ${dst}`)
  console.log(``)
  console.log(`Next: restart Claude Code so the skill is picked up.`)
  console.log(`Verify: run "claude /skills" and confirm "tsops" appears.`)
}

async function uninstall({ scope }) {
  const dst = targetDir(scope)
  if (!(await exists(dst))) {
    console.log(`Nothing to uninstall — ${dst} does not exist.`)
    exit(0)
  }
  // Conservative: only remove files we'd write. Use rm with force.
  const { rm } = await import('node:fs/promises')
  await rm(dst, { recursive: true, force: true })
  console.log(`Removed ${dst}`)
}

async function where({ scope }) {
  const dst = targetDir(scope)
  console.log(dst)
  console.log((await exists(dst)) ? '(installed)' : '(not installed)')
}

const args = parseArgs(argv.slice(2))
if (args.help) {
  help()
  exit(0)
}

try {
  if (args.command === 'install') await install(args)
  if (args.command === 'uninstall') await uninstall(args)
  if (args.command === 'where') await where(args)
} catch (err) {
  console.error(err.message ?? err)
  exit(1)
}
