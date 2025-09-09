import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/minimal.ts'],
  format: ['esm'],
  dts: true,
  clean: false,
  minify: false,
  treeshake: true,
  splitting: false,
  sourcemap: false,
  target: 'es2020'
})