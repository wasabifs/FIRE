import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 強制清除舊版 Service Worker（解決 PWA 快取卡住問題）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      // 如果有 waiting 的新版 SW，立即啟用
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
