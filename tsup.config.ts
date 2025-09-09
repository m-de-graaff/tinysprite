import { defineConfig } from 'tsup'

// Shared tsup config for all packages
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: false,
  treeshake: true,
  splitting: false,
  sourcemap: false,
  target: 'es2020',
})
