import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/tinysprite.min.js',
    format: 'iife',
    name: 'TinySprite',
    sourcemap: false,
  },
  plugins: [
    typescript({
      target: 'es2020',
      module: 'esnext',
      declaration: false,
    }),
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
