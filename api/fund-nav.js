/**
 * api/fund-nav.js — 台灣基金淨值查詢 + 關鍵字搜尋
 *
 * GET /api/fund-nav?codes=T3703Y          → 查淨值
 * GET /api/fund-nav?search=國泰中小        → 搜尋基金列表（回傳本地 DB）
 *
 * 淨值來源：投信投顧公會 SITCA 單筆查詢頁面（HTML 解析）
 * 搜尋：直接回傳前端本地 DB，不走 API
 */

const SITCA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
}

async function fetchNavFromSitca(code) {
  // SITCA 基金淨值查詢
  const url = `https://www.sitca.org.tw/ROC/Industry/IN2413.aspx?FUND_ID=${encodeURIComponent(code)}&txttype=2`
  
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: SITCA_HEADERS,
  })
  if (!r.ok) throw new Error(`SITCA HTTP ${r.status}`)

  const buf  = await r.arrayBuffer()
  const text = new TextDecoder('big5', { fatal: false }).decode(buf)

  // 解析淨值：找數字格式的淨值
  // SITCA 頁面結構：表格中包含日期和淨值
  // 嘗試多種 pattern
  
  let price = null
  let date  = null
  let name  = null

  // Pattern 1: 常見格式 <td>NNN.NN</td> 後面跟漲跌
  const patterns = [
    // 淨值欄：三位數以上加小數
    /最新淨值[^]*?(\d{2,4}\.\d{2})/,
    /淨值[^]*?<td[^>]*>\s*([\d,]+\.\d{2})\s*<\/td>/i,
    /<td[^>]*>\s*([\d,]{3,10}\.\d{2})\s*<\/td>\s*<td[^>]*>\s*[\d.+-]/,
    // 數字在表格
    /(\d{2,4}\/\d{2}\/\d{2})[^]*?(\d{3,4}\.\d{2})/,
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      // 最後一個 capture group 是數字
      const numStr = m[m.length - 1]?.replace(/,/g, '')
      const num    = parseFloat(numStr)
      if (num > 1 && num < 100000) {
        price = num
        break
      }
    }
  }

  // 找日期 YYYY/MM/DD 或 YYYYMMDD
  const dateM = text.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  if (dateM) date = `${dateM[1]}-${dateM[2]}-${dateM[3]}`

  // 找基金名稱（頁面 title 或 h1）
  const nameM = text.match(/<title>([^<]{4,60})<\/title>/i)
    || text.match(/<h[12][^>]*>([^<]{4,60})<\/h[12]>/i)
  if (nameM) name = nameM[1].trim().replace(/[\r\n\t]+/g, ' ')

  // debug log
  console.log(`[fund-nav] SITCA ${code}: price=${price}, date=${date}`)
  console.log(`[fund-nav] SITCA ${code}: text snippet =`, text.substring(0, 500))

  return price ? { price, date, name } : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  // 搜尋模式：前端本地 DB 處理，這裡只回傳空陣列
  if (search) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ funds: [] })
  }

  if (!codes) return res.status(400).json({ error: 'codes required' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    try {
      const nav = await fetchNavFromSitca(code)
      if (nav) return { code, ...nav, source: 'sitca' }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  return res.status(200).json({ funds: results })
}
