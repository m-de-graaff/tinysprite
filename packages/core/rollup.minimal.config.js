import terser from '@rollup/plugin-terser'

export default {
  // Use the prebuilt minimal ESM from tsup to avoid TS plugin/tslib
  input: 'dist/minimal.js',
  output: {
    file: 'dist/tinysprite.min.js',
    format: 'iife',
    name: 'TinySprite',
    sourcemap: false,
  },
  plugins: [
    terser({
      module: true,
      toplevel: true,
      compress: {
        passes: 3,
        unsafe: true,
        pure_getters: true,
        pure_funcs: ['/*#__PURE__*/'],
      },
      mangle: {
        properties: {
          regex: /^_/,
        },
      },
      format: {
        comments: false,
      },
    }),
  ],
}
