import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Two builds from one codebase:
//   npm run build      → the Android / iOS apps: the app alone at dist/index.html (Capacitor loads it), as always.
//   npm run build:web  → the website (what Vercel runs, `vite build --mode web`) in dist-web/: the marketing site at /
//                        and the web app at /app/. Vercel serves a real index.html before any rewrite, so the site
//                        has to be the file at the root — hence the move in webLayout() below. Its own folder, so a
//                        website build can never end up in the apps through `cap sync` (which copies dist/).
// In `npm run dev` the app stays at / (so ?ob=N and the documented URLs keep working), the site is at /site/, and
// /app/ plus vercel.json's page rewrites (/privacy-policy…) behave as they do in production.
export default defineConfig(({ mode }) => {
  const web = mode === 'web'
  return {
    plugins: [react(), productionRoutesInDev(), ...(web ? [webLayout()] : [])],
    build: web
      ? {
          // never dist/: that folder is what `cap sync` copies into the Android and iOS apps
          outDir: 'dist-web',
          rolldownOptions: {
            input: {
              app: resolve(root, 'index.html'),
              site: resolve(root, 'site/index.html'),
              notFound: resolve(root, 'site/404.html'),
            },
          },
        }
      : {},
  }
})

/** Website build only: the app moves to /app/, the marketing site and its 404 page to the root, and site/public/'s
 *  files join them. */
function webLayout(): Plugin {
  let outDir = 'dist'
  return {
    name: 'kx-web-layout',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const move = (from: string, to: string) => {
        const source = join(outDir, from)
        if (!existsSync(source)) throw new Error(`kx-web-layout: ${from} was not built`)
        mkdirSync(dirname(join(outDir, to)), { recursive: true })
        renameSync(source, join(outDir, to))
      }
      move('index.html', 'app/index.html') // first: the site takes its place next
      move('site/index.html', 'index.html')
      move('site/404.html', '404.html')
      rmSync(join(outDir, 'site'), { recursive: true, force: true }) // now empty
      // website-only files (robots.txt, sitemap.xml, the link-preview image) — public/ would put them in the apps too
      cpSync(resolve(root, 'site/public'), outDir, { recursive: true })
    },
  }
}

/** Dev server: /app/ opens the app, and vercel.json's page rewrites work, so links behave as in production. */
function productionRoutesInDev(): Plugin {
  return {
    name: 'kx-production-routes-in-dev',
    apply: 'serve',
    configureServer(server) {
      const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
        rewrites?: { source: string; destination: string }[]
      }
      const pages = new Map(
        (vercel.rewrites ?? [])
          .filter(r => !r.source.startsWith('/api') && !r.source.includes('(') && r.source !== '/app')
          .map(r => [r.source, r.destination]),
      )
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === '/app' || url.pathname === '/app/') {
          req.url = `/index.html${url.search}`
        } else if (pages.has(url.pathname)) {
          req.url = `${pages.get(url.pathname)}${url.search}`
        }
        next()
      })
    },
  }
}
