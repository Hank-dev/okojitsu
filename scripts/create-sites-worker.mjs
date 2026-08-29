import { copyFile, cp, mkdir } from 'node:fs/promises'
import { build } from 'vite'

await mkdir('dist/server', { recursive: true })
await build({
  configFile: false,
  build: {
    ssr: 'src/server/worker.ts',
    outDir: 'dist/server',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
})

await mkdir('dist/.openai', { recursive: true })
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json')
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true })
