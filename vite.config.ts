import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * En dev, Nitro comprime al vuelo con brotli a calidad máxima cada archivo de public/: el cubo
 * de ~9 MB tardaba ~25 s en cada carga. En local no aporta nada, así que /data va sin comprimir.
 */
function serveDataIndex(req: { url?: string; headers: Record<string, unknown> }, next: () => void) {
  delete req.headers['accept-encoding']
  const path = (req.url ?? '').split('?')[0]
  if (path === '' || path === '/' || path === '/data' || path === '/data/') {
    req.url = path.startsWith('/data') ? '/data/index.html' : '/index.html'
  }
  next()
}

const rawDataInDev: Plugin = {
  name: 'raw-data-in-dev',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use('/data', (req, _res, next) => {
      serveDataIndex(req, next)
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use('/data', (req, _res, next) => {
      serveDataIndex(req, next)
    })
  },
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    rawDataInDev,
    // Los elementos de React Three Fiber (<mesh>, <group>…) no son DOM: R3F interpreta el
    // atributo data-tsd-source como ruta de propiedades y truena.
    devtools({ injectSource: { enabled: true, ignore: { files: [/features\/explorer\/scene\//] } } }),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
