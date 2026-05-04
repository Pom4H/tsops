#!/usr/bin/env node
/**
 * Build step for @tsops/skill.
 *
 * The canonical source for the Skill lives at the repo root in
 * `skills/tsops/`. This script syncs it into `packages/skill/skill/`
 * so that the npm tarball ships the files. We don't symlink because
 * npm's tarball does not preserve symlinks reliably across all
 * package managers.
 */
import { cp, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(__dirname, '..')
const REPO_ROOT = resolve(PKG_DIR, '..', '..')

const SRC = join(REPO_ROOT, 'skills', 'tsops')
const DST = join(PKG_DIR, 'skill')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(SRC))) {
  console.error(`Source skill missing: ${SRC}`)
  process.exit(1)
}

if (await exists(DST)) {
  await rm(DST, { recursive: true, force: true })
}

await cp(SRC, DST, { recursive: true })
console.log(`Synced ${SRC} → ${DST}`)
