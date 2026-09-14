import { readFileSync } from 'node:fs'
import pkg from './package.json' with { type: 'json' }
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base 對應 GitHub Pages 路徑:https://kenneth0604.github.io/FamilyTreeApp/
const BASE = '/FamilyTreeApp/'
const SW_SOURCE = fileURLToPath(new URL('./src/sw.js', import.meta.url))

/** 把 src/sw.js 輸出成 <base>/sw.js,並注入建置 ID 讓每次部署都換新快取 */
function serviceWorkerPlugin() {
  const buildId = Date.now().toString(36)
  const load = () => readFileSync(SW_SOURCE, 'utf8').replace(/__BUILD_ID__/g, buildId)
  return {
    name: 'familytree-sw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === `${BASE}sw.js`) {
          res.setHeader('Content-Type', 'application/javascript')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(load())
          return
        }
        next()
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: load() })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
