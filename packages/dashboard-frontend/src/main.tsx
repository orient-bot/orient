import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const viteBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const runtimeBase = window.location.pathname.startsWith('/dashboard') ? '/dashboard' : viteBase

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={runtimeBase || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)




