import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: false, // Rollup handles minification for IIFE
  treeshake: true,
  splitting: false,
  sourcemap: false,
  target: 'es2020'
})