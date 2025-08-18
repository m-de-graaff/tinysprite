#!/usr/bin/env node

/**
 * Local size checking script for TinySprites
 * Usage: node scripts/check-size.js
 */

import fs from 'fs';
import path from 'path';

const DIST_DIR = './dist';
const SIZE_LIMITS = {
  decoder: 10000,  // 10KB
  encoder: 10000,  // 10KB
  total: 20000     // 20KB
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 bytes';
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkFileSize(filePath, expectedName) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${expectedName} not found at ${filePath}`);
    return null;
  }
  
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const formatted = formatBytes(size);
  
  return { size, formatted, path: filePath };
}

function main() {
  console.log('🔍 TinySprites Size Check\n');
  
  // Check if dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist/ directory not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  // Check decoder
  const decoder = checkFileSize('./dist/decoder.min.js', 'decoder.min.js');
  if (!decoder) process.exit(1);
  
  // Check encoder
  const encoder = checkFileSize('./dist/encoder.min.js', 'encoder.min.js');
  if (!encoder) process.exit(1);
  
  // Calculate totals
  const totalSize = decoder.size + encoder.size;
  const totalFormatted = formatBytes(totalSize);
  
  // Display results
  console.log('📊 Bundle Sizes:');
  console.log(`  Decoder: ${decoder.formatted} (${decoder.size} bytes)`);
  console.log(`  Encoder: ${encoder.formatted} (${encoder.size} bytes)`);
  console.log(`  Total:   ${totalFormatted} (${totalSize} bytes)`);
  console.log('');
  
  // Check limits
  console.log('✅ Size Compliance:');
  const decoderOk = decoder.size <= SIZE_LIMITS.decoder;
  const encoderOk = encoder.size <= SIZE_LIMITS.encoder;
  const totalOk = totalSize <= SIZE_LIMITS.total;
  
  console.log(`  Decoder: ${decoderOk ? '✅' : '⚠️'} ${decoderOk ? 'Within limit' : `Exceeds ${formatBytes(SIZE_LIMITS.decoder)}`}`);
  console.log(`  Encoder: ${encoderOk ? '✅' : '⚠️'} ${encoderOk ? 'Within limit' : `Exceeds ${formatBytes(SIZE_LIMITS.encoder)}`}`);
  console.log(`  Total:   ${totalOk ? '✅' : '⚠️'} ${totalOk ? 'Within limit' : `Exceeds ${formatBytes(SIZE_LIMITS.total)}`}`);
  
  // Summary
  console.log('');
  if (decoderOk && encoderOk && totalOk) {
    console.log('🎉 All size checks passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some size limits exceeded. Consider optimization.');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
