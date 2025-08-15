#!/usr/bin/env node
/**
 * Minify tinysprites.js -> tinysprites.min.js
 *
 * Usage:
 *   1) npm i terser --save-dev
 *   2) node build.js
 */
const fs = require('fs');
const path = require('path');
const terser = require('terser');

// Pre-processing function to remove unnecessary whitespace and comments
function preprocessCode(code) {
  return code
    // Remove single-line comments (but keep license comments)
    .replace(/\/\/[^\n]*\n/g, '\n')
    // Remove extra blank lines
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    // Remove trailing whitespace
    .replace(/[ \t]+$/gm, '')
    // Remove leading whitespace on empty lines
    .replace(/^\s+$/gm, '');
}

const inputFile = path.resolve(__dirname, 'tinysprites.js');
const outputFile = path.resolve(__dirname, 'tinysprites.min.js');

(async () => {
  try {
    const src = fs.readFileSync(inputFile, 'utf8');
    
    // Pre-process the code to remove unnecessary whitespace and comments
    const preprocessed = preprocessCode(src);

    const banner =
      '/*! TinySprites — MIT License | https://github.com/m-de-graaf/tinysprites */';

    const result = await terser.minify(preprocessed, {
      ecma: 2019,
      compress: {
        // Basic optimizations
        arrows: true,
        booleans: true,
        booleans_as_integers: true,
        collapse_vars: true,
        comparisons: true,
        conditionals: true,
        dead_code: true,
        drop_console: true,
        drop_debugger: true,
        evaluate: true,
        hoist_funs: true,
        hoist_props: true,
        hoist_vars: true,
        if_return: true,
        inline: 3, // Most aggressive inlining
        join_vars: true,
        keep_fargs: false,
        loops: true,
        negate_iife: true,
        passes: 4, // More passes for deeper optimization
        properties: true,
        pure_getters: true,
        reduce_vars: true,
        reduce_funcs: true, // Inline single-use functions
        sequences: true,
        side_effects: true,
        switches: true,
        toplevel: true,
        typeofs: true,
        unused: true,
        
        // Additional aggressive optimizations
        arguments: true, // Replace arguments[index] with parameter names
        computed_props: true, // Transform constant computed properties
        directives: true, // Remove redundant directives
        expression: true, // Preserve completion values
        global_defs: {}, // Enable conditional compilation
        keep_infinity: false, // Allow Infinity compression
        lhs_constants: true, // Move constants to left side
        module: false, // Not an ES6 module
        pure_funcs: null, // Could add pure function list here
        pure_new: true, // Assume new X() has no side effects
        
        // Additional optimizations
        defaults: true, // Enable all default transforms
        keep_classnames: false, // Allow class name mangling
        keep_fargs: false, // Allow function argument removal
        
        // Advanced optimizations
        top_retain: null, // Don't retain any top-level functions/variables
        

        
        // Aggressive unsafe optimizations
        unsafe: true,
        unsafe_arrows: true,
        unsafe_Function: true,
        unsafe_math: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        unsafe_undefined: true,
        unsafe_comps: true,
        unsafe_symbols: true // Remove keys from native Symbol declarations
      },
      mangle: {
        toplevel: true,
        eval: true,
        keep_fnames: false,
        reserved: [],
        module: false,
        safari10: false
      },
      format: {
        ecma: 2019,
        preamble: banner,
        comments: false,
        beautify: false,
        indent_level: 0,
        max_line_len: 0,
        semicolons: true,
        ascii_only: true,
        keep_numbers: false, // Allow number optimizations like 1000000 -> 1e6
        quote_style: 0, // Best for gzip size
        wrap_iife: false, // Don't wrap IIFEs
        wrap_func_args: false, // Don't wrap function arguments
        

      }
    });

    if (result.error) {
      console.error('Terser error:', result.error);
      process.exit(1);
    }

    fs.writeFileSync(outputFile, result.code, 'utf8');

    const orig = Buffer.byteLength(src, 'utf8');
    const min = Buffer.byteLength(result.code, 'utf8');

    console.log('Minified:', path.basename(inputFile), '->', path.basename(outputFile));
    console.log(`Size: ${orig} B -> ${min} B (${((1 - min / orig) * 100).toFixed(1)}% saved)`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
