#!/usr/bin/env node
import { encodeTinySprite } from './index.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log('tinysprite-encode <input> -o <output>');
  process.exit(0);
}

void encodeTinySprite([]);
