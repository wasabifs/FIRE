import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '資產追蹤器',
        short_name: '資產',
        description: '個人資產管理 App',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // 讓 /api/* 完全不被 Service Worker 攔截
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // 明確排除 /api/* 不快取
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          }
        ]
      }
    })
  ]
})
