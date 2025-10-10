/**
 * Type tests runner using vitest + tsc
 * 
 * Approach:
 * - Each test case is a separate .ts file
 * - Files starting with "valid-" should compile without errors
 * - Files starting with "invalid-" should fail to compile
 * - Runner spawns tsc for each file and checks exit code
 */

import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Run TypeScript compiler on a file and return exit code
 */
async function checkTypeScript(filePath: string): Promise<{ 
  exitCode: number
  stdout: string
  stderr: string 
}> {
  return new Promise((resolve) => {
    const tsc = spawn('npx', [
      'tsc',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target', 'ES2020',
      '--module', 'ES2020',
      '--moduleResolution', 'bundler',
      '--lib', 'ES2020',
      '--downlevelIteration',
      '--isolatedModules',
      filePath
    ], {
      cwd: join(__dirname, '../../../../..') // workspace root
    })

    let stdout = ''
    let stderr = ''

    tsc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    tsc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    tsc.on('close', (code) => {
      resolve({ 
        exitCode: code || 0, 
        stdout, 
        stderr 
      })
    })
  })
}

/**
 * Get all test files in directory
 */
async function getTestFiles(pattern: string): Promise<string[]> {
  const files = await fs.readdir(__dirname)
  return files
    .filter(f => f.startsWith(pattern) && f.endsWith('.ts'))
    .map(f => join(__dirname, f))
}

describe('Type System Tests', () => {
  describe('Valid cases - should compile without errors', async () => {
    const validFiles = await getTestFiles('valid-')
    
    for (const filePath of validFiles) {
      const fileName = filePath.split('/').pop() || ''
      
      it(`✅ ${fileName}`, async () => {
        const result = await checkTypeScript(filePath)
        
        if (result.exitCode !== 0) {
          console.error('Compilation failed:')
          console.error(result.stdout)
          console.error(result.stderr)
        }
        
        expect(result.exitCode).toBe(0)
      }, 30000) // 30s timeout for tsc
    }
  })

  describe('Type inference tests', async () => {
    const inferenceFiles = await getTestFiles('inference-')
    
    for (const filePath of inferenceFiles) {
      const fileName = filePath.split('/').pop() || ''
      
      it(`🔍 ${fileName}`, async () => {
        const result = await checkTypeScript(filePath)
        
        if (result.exitCode !== 0) {
          console.error('Compilation failed:')
          console.error(result.stdout)
          console.error(result.stderr)
        }
        
        expect(result.exitCode).toBe(0)
      }, 30000)
    }
  })
  
  // Note: Invalid type tests removed - validation happens at runtime
  // See runtime-*.test.ts for runtime validation tests
})
