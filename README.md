# 資產追蹤器 PWA

個人資產管理 App，使用 React + Vite + Supabase 建構。

## 開發

```bash
npm install
npm run dev
```

## 部署到 Vercel

1. 把這個資料夾推到 GitHub（記得 .env 不要上傳）
2. 在 Vercel 匯入 GitHub repo
3. 在 Vercel Environment Variables 設定：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## 加到 iPhone 主畫面

部署後用 Safari 開啟網址 → 分享 → 加入主畫面
