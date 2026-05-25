/**
 * api/fund-nav.js — 台灣基金淨值查詢 + 關鍵字搜尋
 *
 * GET /api/fund-nav?codes=T3703Y,T3201Y   → 查淨值
 * GET /api/fund-nav?search=國泰中小        → 搜尋基金列表
 *
 * 資料來源（金管會官方開放資料）：
 *   淨值：https://www.sitca.org.tw/MemberK0000/F/03/nav.csv  (每日更新，Big5)
 *   名冊：https://mopsfin.twse.com.tw/opendata/t187ap47_L.csv (UTF-8)
 */

const NAV_URL  = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv'
const LIST_URL = 'https://mopsfin.twse.com.tw/opendata/t187ap47_L.csv'

// ── CSV 解析工具 ─────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let field = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  result.push(field.trim())
  return result
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  })
}

// ── Big5 → UTF-8 轉換 ────────────────────────────────────────
async function fetchBig5CSV(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const buf = await r.arrayBuffer()
  // Vercel Node.js 環境有 TextDecoder
  const text = new TextDecoder('big5').decode(buf)
  return text
}

async function fetchUTF8CSV(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

// ── 解析 SITCA nav.csv ────────────────────────────────────────
// 欄位：日期, 會員代號, 公司名稱, 統一編號, 基金代號, 基金名稱, 淨值, 漲跌, 漲跌百分比, 類型代號, 幣別, 受益憑證代號
function parseNavCSV(text) {
  const rows = parseCSV(text)
  const map = {}
  for (const row of rows) {
    // 嘗試多種可能欄位名
    const code  = (row['基金代號'] || row['基金代碼'] || row['Fund_ID'] || '').trim()
    const name  = (row['基金名稱'] || row['FundName'] || '').trim()
    const nav   = parseFloat((row['淨值'] || row['NAV'] || row['Nav'] || '').replace(/,/g, ''))
    const date  = (row['日期'] || row['Date'] || '').trim()
    if (code && !isNaN(nav) && nav > 0) {
      map[code] = { code, name, price: nav, date }
    }
  }
  return map
}

// ── 解析 TWSE t187ap47_L.csv 基金清單 ─────────────────────────
// 欄位（UTF-8）：基金代號、基金名稱、管理公司、幣別...
function parseFundListCSV(text) {
  const rows = parseCSV(text)
  return rows.map(row => {
    const code    = (row['基金代號'] || row['FundCode'] || Object.values(row)[0] || '').trim()
    const name    = (row['基金名稱'] || row['FundName'] || Object.values(row)[1] || '').trim()
    const company = (row['管理公司'] || row['Company']  || Object.values(row)[2] || '').trim()
    return { code, name, company }
  }).filter(r => r.code && r.name)
}

// ── 主 handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  // ── 搜尋模式 ──
  if (search) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
    try {
      const text = await fetchUTF8CSV(LIST_URL)
      const all  = parseFundListCSV(text)
      const q    = search.trim().toLowerCase()
      const hits = all.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        f.company.toLowerCase().includes(q)
      ).slice(0, 10)
      return res.status(200).json({ funds: hits })
    } catch (e) {
      console.error('[fund-nav] search error:', e.message)
      return res.status(200).json({ funds: [], error: e.message })
    }
  }

  // ── 淨值查詢模式 ──
  if (!codes) return res.status(400).json({ error: 'codes or search required' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)
  try {
    const text   = await fetchBig5CSV(NAV_URL)
    const navMap = parseNavCSV(text)

    const results = codeList.map(code => {
      const found = navMap[code]
      return found
        ? { code, name: found.name, price: found.price, date: found.date, source: 'sitca' }
        : { code, name: null, price: null, date: null, source: null }
    })
    return res.status(200).json({ funds: results })
  } catch (e) {
    console.error('[fund-nav] nav error:', e.message)
    // 全部回 null，讓前端降級到手動輸入
    return res.status(200).json({
      funds: codeList.map(code => ({ code, name: null, price: null, date: null, source: null })),
      error: e.message,
    })
  }
}
