// 開發用:只跑樹狀圖,資料層換成 src/dev/mockStore.jsx,不需要 Supabase
//   npx vite --config vite.harness.config.js   → http://localhost:5199/harness.html
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 整個 specifier 一起換掉(regex alias 只替換匹配到的片段,只比對尾巴會留下開頭的 ../)
    alias: [{ find: /^(\.\.\/)+lib\/store\.jsx$/, replacement: path.resolve(import.meta.dirname, 'src/dev/mockStore.jsx') }],
  },
  define: { __APP_VERSION__: JSON.stringify('harness') },
  server: { port: 5199, strictPort: true },
})
