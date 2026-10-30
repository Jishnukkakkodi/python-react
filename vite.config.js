import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Absolute, so the config means the same thing whatever directory it is run
// from — `npm run build` from the project root and `docker build` from a
// different one must not resolve `resources` differently.
const here = path.dirname(fileURLToPath(import.meta.url))

// `static/` is entirely generated — Vite writes `dist/`, collectstatic writes
// `collected/` — but the directory itself has to exist in a fresh clone,
// because `STATICFILES_DIRS` names it and Django warns when it is missing.
//
// The answer is a tracked `static/.gitignore` holding `*` and `!.gitignore`:
// git keeps the one file, which keeps the directory, and ignores everything a
// build drops beside it. This plugin restores that file after each build, so
// wiping `static/` and rebuilding leaves the tree in the state git expects
// rather than quietly staging a few hundred compiled assets.
function copyGitignore() {
  return {
    name: 'copy-gitignore',

    closeBundle() {
      const source = path.resolve(here, 'resources/meta/.gitignore')
      const destination = path.resolve(here, 'static/.gitignore')

      if (!fs.existsSync(source)) {
        // A warning, not a throw: a missing marker file is a repository that
        // needs tidying, and failing the build over it would be out of all
        // proportion.
        this.warn(`copy-gitignore: ${source} is missing, skipping`)
        return
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(source, destination)
    },
  }
}

export default defineConfig(({ command }) => {
  // The third argument is '' rather than 'VITE_': this reads the project's own
  // `.env`, which is not prefixed. Nothing from it is inlined into the bundle
  // — it is used here, at config time, to find the backend.
  const env = loadEnv(command, here, '')
  const target = env.API_BACKEND_URL || `http://127.0.0.1:${env.PORT || 8080}`

  return {
    plugins: [react(), tailwindcss(), copyGitignore()],
    root: path.resolve(here, 'resources'),

    // **Conditional, and that is not cosmetic.** A build is served by Django
    // from `/static/dist/`, so its asset URLs must carry that prefix. The dev
    // server serves from the root, and a fixed `/static/dist/` base would put
    // the app at `localhost:5173/static/dist/` *and* send its own module
    // requests down a path the `/static` proxy below hands to Django — which
    // answers 404 for a file only Vite has.
    base: command === 'build' ? '/static/dist/' : '/',

    build: {
      outDir: path.resolve(here, 'static/dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(here, 'resources/index.html'),
        output: {
          // Stated rather than left to the default, because the server side
          // depends on the shape: `WHITENOISE_IMMUTABLE_FILE_TEST` matches
          // `assets/<name>-<hash>.<ext>` to decide what may be cached
          // forever. A change here silently turns that off.
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },

    server: {
      // **Keep the file watcher off the trees it has no business in.** Vite's
      // root is `resources/`, but its config and `.env` live a level up, so
      // the watcher walks the project root — and `.venv` alone is 3,250
      // directories of installed packages. Each one costs an inotify watch,
      // of which a Linux host grants a finite number per user; exhaust them
      // and the dev server dies at startup with `ENOSPC`, which reads as a
      // full disk and is not one.
      watch: {
        ignored: [
          '**/.venv/**',
          '**/static/**',
          '**/storage/**',
          '**/__pycache__/**',
          '**/.git/**',
        ],
      },
      port: 5173,
      // Fail loudly instead of moving to 5174, where nothing proxying to the
      // expected port would reach it.
      strictPort: true,
      // Listen on every interface. The stack runs with host networking, so
      // the dev server should be reachable the same way the real one is.
      host: true,
      // **One origin in development, as in production.** Everything the
      // interface talks to is proxied through Vite, so the browser sees a
      // single host and the session cookie, CSRF cookie and same-origin
      // credentials behave exactly as they will once Django serves the built
      // bundle. Proxy any of this wrongly and you debug a CORS problem that
      // will not exist in production.
      proxy: {
        '/api': { target, changeOrigin: false },
        '/admin': { target, changeOrigin: false },
        // The whole of `/static`, not just the admin's share: with `base` set
        // to '/' above, Vite claims nothing under this prefix, and Django
        // owns every asset served from it.
        '/static': { target, changeOrigin: false },
      },
    },
  }
})
