/**
 * api/fund-nav.js — 台灣基金淨值查詢 + 關鍵字搜尋
 *
 * GET /api/fund-nav?codes=T3703Y          → 查淨值
 * GET /api/fund-nav?search=國泰中小        → 搜尋基金列表
 *
 * 資料來源：
 *   搜尋：鉅亨網 search API
 *   淨值：鉅亨網（搜尋取得 anueId 後查詢）
 *
 * 本地代碼對照表（避免每次都要搜尋）
 */

// 代碼 → 鉅亨內部 ID 對照（從搜尋結果預先建立）
const CODE_TO_ANUE = {
  'T3703Y': null,  // 動態查詢
  'T3707Y': null,
  'T3201Y': 'A32001',  // 野村優質基金（已知）
  'T3207Y': null,
  'T3604Y': null,
}

const ANUE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Referer': 'https://fund.cnyes.com/',
  'Accept': 'application/json',
}

// ── 鉅亨搜尋（回傳含 anueId）────────────────────────────────
async function searchCnyes(keyword) {
  const url = `https://fund.api.cnyes.com/fund/api/v2/search?search=${encodeURIComponent(keyword)}&limit=10`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: ANUE_HEADERS })
  if (!r.ok) return []
  const data = await r.json()
  const items = data?.data?.items || data?.items || []
  return items.map(i => ({
    code:    (i.fundCode || i.code || '').trim(),
    name:    (i.fundName || i.name || '').trim(),
    company: (i.companyCh || i.company || '').trim(),
    anueId:  String(i.cnyesCode || i.fundId || i.id || ''),
  })).filter(i => i.code)
}

// ── 鉅亨取淨值（用 anueId）───────────────────────────────────
async function getNavByAnueId(anueId) {
  const url = `https://fund.api.cnyes.com/fund/api/v2/funds/${anueId}/nav?format=json`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: ANUE_HEADERS })
  if (!r.ok) return null
  const data = await r.json()
  // 各種可能的資料結構
  const d = data?.data
  const nav = Array.isArray(d) ? d[0] : (d || null)
  if (!nav) return null
  const price = parseFloat(nav.nav || nav.price || nav.NAV || nav.netAssetValue || 0)
  const date  = nav.date || nav.navDate || null
  return price > 0 ? { price, date } : null
}

// ── 主 handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  // ── 搜尋模式 ──
  if (search) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    try {
      const results = await searchCnyes(search.trim())
      return res.status(200).json({ funds: results })
    } catch (e) {
      return res.status(200).json({ funds: [], error: e.message })
    }
  }

  // ── 淨值查詢模式 ──
  if (!codes) return res.status(400).json({ error: 'codes or search required' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }

    try {
      // 先搜尋取得 anueId
      const hits = await searchCnyes(code)
      const match = hits.find(h => h.code.toUpperCase() === code.toUpperCase()) || hits[0]
      if (!match?.anueId) return empty

      const nav = await getNavByAnueId(match.anueId)
      if (nav) return { code, name: match.name, ...nav, source: 'cnyes' }
    } catch (e) {
      console.error(`[fund-nav] error for ${code}:`, e.message)
    }

    return empty
  }))

  return res.status(200).json({ funds: results })
}
