import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import '../index.css'
import Tree from '../pages/Tree.jsx'
import Timeline from '../pages/Timeline.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <div className="relative h-screen w-screen bg-bg">
        <Routes>
          {/* #/timeline:時間軸(和 App 一樣放在可捲動的 main 裡) */}
          <Route path="timeline" element={<main className="mx-auto h-full max-w-md overflow-y-auto px-4 pb-6 pt-4"><Timeline /></main>} />
          <Route path="*" element={<Tree />} />
        </Routes>
      </div>
    </HashRouter>
  </StrictMode>,
)
