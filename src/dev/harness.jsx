import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import '../index.css'
import Tree from '../pages/Tree.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <div className="relative h-screen w-screen bg-bg">
        <Routes>
          <Route path="*" element={<Tree />} />
        </Routes>
      </div>
    </HashRouter>
  </StrictMode>,
)
