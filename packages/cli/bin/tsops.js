#!/usr/bin/env node

if (process.argv[2] === 'dev') {
  await import('../dist/dev-cli.js')
} else {
  await import('../dist/cli.js')
}
