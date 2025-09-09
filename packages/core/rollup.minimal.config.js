import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

export default {
  input: 'src/minimal.ts',
  output: {
    file: 'dist/tinysprite.minimal.min.js',
    format: 'iife',
    name: 'TinySprite',
    sourcemap: false
  },
  plugins: [
    typescript({
      target: 'es2020',
      module: 'esnext',
      declaration: false
    }),
    terser({
      module: true,
      toplevel: true,
      compress: {
        passes: 3,
        unsafe: true,
        pure_getters: true,
        pure_funcs: ['/*#__PURE__*/']
      },
      mangle: {
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false
      }
    })
  ]
}