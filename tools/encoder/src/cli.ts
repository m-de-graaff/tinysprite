#!/usr/bin/env node

/**
 * @fileoverview TinySprites CLI - Command line encoder
 * @license MIT
 */

import { Command } from 'commander'

const program = new Command()

program
  .name('tinysprites-encode')
  .description('Encode PNG/GIF files to tinysprites format')
  .version('0.1.0')
  .argument('<files...>', 'Input PNG/GIF files')
  .option('--max <colors>', 'Maximum colors in palette', '16')
  .option('--scan <modes>', 'Scan modes (row,serp)', 'row')
  .option('--packers <types>', 'Packer types (text,b64)', 'text')
  .option('--rects <bool>', 'Use rectangles', 'true')
  .option('--profile <type>', 'Profile type (sprites,anim,tilemap)', 'sprites')
  .option('--pack <file>', 'Output pack file')
  .action((files, options) => {
    console.log('TinySprites Encoder v0.1.0')
    console.log('Files:', files)
    console.log('Options:', options)
    console.log('Encoder implementation coming in Phase 3!')
    process.exit(1)
  })

program.parse()