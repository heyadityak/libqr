import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

/**
 * Layer boundaries, per ADR-0003. Imports flow one direction only:
 *
 *   util  <-  ec  <-  core  <-  render  <-  dom
 *                       ^
 *                   encode
 *
 * Each zone below reads "files in `target` may not import from `from`".
 * `src/index.js` is deliberately not inside any layer directory, so it is
 * exempt -- it is the only file allowed to re-export across layers.
 */
const LAYER_ZONES = [
  { target: './src/util', from: ['./src/ec', './src/encode', './src/core', './src/render', './src/dom'] },
  { target: './src/ec', from: ['./src/encode', './src/core', './src/render', './src/dom'] },
  { target: './src/encode', from: ['./src/ec', './src/core', './src/render', './src/dom'] },
  { target: './src/core', from: ['./src/render', './src/dom'] },
  { target: './src/render', from: ['./src/dom'] },
];

/** Browser surface that must not appear below `src/render`, per ADR-0004. */
const BROWSER_GLOBALS = [
  'document',
  'window',
  'navigator',
  'fetch',
  'Image',
  'HTMLElement',
  'customElements',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
];

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'examples/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { import: importPlugin },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // ADR-0003: layer boundaries. A violation is a lint error, not a review comment.
    files: ['src/**/*.js'],
    languageOptions: {
      // Universal across both targets (evergreen browsers and Node >= 18), so
      // available at every layer. Browser-only globals are added for
      // src/render and src/dom below, and banned below that by ADR-0004.
      globals: {
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      'import/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: LAYER_ZONES }],
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'no-console': 'error',
      // ADR-0009: typed errors only.
      'no-throw-literal': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement > NewExpression > Identifier.callee[name="Error"]',
          message: 'Throw a typed error from util/errors.js, not a bare Error (ADR-0009).',
        },
      ],
    },
  },
  {
    // ADR-0004: nothing below src/render may touch the browser.
    files: ['src/core/**/*.js', 'src/ec/**/*.js', 'src/encode/**/*.js', 'src/util/**/*.js'],
    rules: {
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS.map((name) => ({
        name,
        message: 'core/ec/encode/util must stay environment-agnostic (ADR-0004).',
      }))],
    },
  },
  {
    // ADR-0004 permits the browser only at and above src/render.
    files: ['src/render/**/*.js', 'src/dom/**/*.js'],
    languageOptions: {
      globals: {
        Blob: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLElement: 'readonly',
        Image: 'readonly',
        ImageData: 'readonly',
        OffscreenCanvas: 'readonly',
        URL: 'readonly',
        customElements: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', 'bench/**/*.js', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
