#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const BUDGET_LIMITS = {
  'packages/core/dist/tinysprite.min.js': 3500, // 3.5KB gzipped
  'packages/core/dist/tinysprite.minimal.min.js': 2000, // 2KB gzipped
}

function getSize(filePath) {
  try {
    const content = readFileSync(filePath)
    const raw = content.length
    const gzip = gzipSync(content).length
    const brotli = brotliCompressSync(content).length
    return { raw, gzip, brotli }
  } catch (err) {
    return null
  }
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString()}B`
}

console.log('📊 Bundle Size Report\n')

let hasErrors = false

for (const [filePath, budget] of Object.entries(BUDGET_LIMITS)) {
  const sizes = getSize(filePath)

  if (!sizes) {
    console.log(`❌ ${filePath} - File not found`)
    hasErrors = true
    continue
  }

  const status = sizes.gzip <= budget ? '✅' : '❌'
  const budgetStatus = sizes.gzip <= budget ? 'PASS' : 'FAIL'

  if (sizes.gzip > budget) {
    hasErrors = true
  }

  console.log(`${status} ${filePath}`)
  console.log(`   Raw: ${formatBytes(sizes.raw)}`)
  console.log(
    `   Gzip: ${formatBytes(sizes.gzip)} (budget: ${formatBytes(budget)}) - ${budgetStatus}`
  )
  console.log(`   Brotli: ${formatBytes(sizes.brotli)}`)
  console.log()
}

if (hasErrors) {
  console.log('❌ Size budget exceeded!')
  process.exit(1)
} else {
  console.log('✅ All size budgets passed!')
}
