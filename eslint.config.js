import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Linting earns its place here for one specific reason: the mistakes it catches
// in JSX are invisible on review and silent at runtime. A duplicate `className`
// is the example — React keeps the last one and says nothing, so an element
// quietly loses the styling you thought you gave it.
export default [
  {
    // `.venv` matters as much as the rest: Django and DRF ship vendored
    // jQuery, select2 and xregexp inside site-packages, and linting those
    // buries our own findings under two thousand reports about somebody
    // else's minified code.
    ignores: [
      '.venv/**',
      'node_modules/**',
      'static/**',
      'storage/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['resources/js/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The interface polls, so a hook with a stale dependency shows a figure
      // that has stopped updating while still looking live. That is the worst
      // failure mode a dashboard has, so it is an error rather than a warning.
      'react-hooks/exhaustive-deps': 'error',

      // Fast refresh silently falls back to a full reload when a module
      // exports anything but components, which costs the page's state on
      // every save.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Caught by hand once already.
      'no-dupe-keys': 'error',

      // An unused variable in this codebase is usually a rename that was only
      // half applied. `_`-prefixed arguments are deliberate.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    // **Two files that cannot satisfy the fast-refresh rule, for reasons of
    // structure rather than of carelessness.**
    //
    // `main.jsx` is the entry point. Editing it reloads the page whatever
    // happens, because it is the module that mounts the tree.
    //
    // `state.jsx` exports providers alongside the hooks that read their
    // context. Separating them means three modules — the contexts, the
    // providers, the hooks — where there is one coherent unit, and the
    // contexts would exist only to be shared between the other two. That is
    // a shape chosen by a linter rather than by the design, so the rule is
    // off here and the DX cost (a full reload when this file is edited) is
    // accepted knowingly.
    files: ['resources/js/main.jsx', 'resources/js/state.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    // The build tooling runs in Node, not a browser.
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
]
