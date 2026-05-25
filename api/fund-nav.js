/**
 * api/fund-nav.js — 台灣基金淨值查詢 Vercel Serverless
 *
 * GET /api/fund-nav?codes=T3703Y,T3201Y
 *
 * 資料來源優先順序：
 *   1. 鉅亨網 fund.api.cnyes.com（最即時）
 *   2. 投信投顧公會 SITCA（官方備援）
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800') // 基金每日一次，快取1h
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes } = req.query
  if (!codes) return res.status(400).json({ error: 'codes required' })

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)
  if (!codeList.length) return res.status(400).json({ error: 'no codes' })

  const results = await Promise.all(codeList.map(code => fetchFundNav(code)))
  return res.status(200).json({ funds: results })
}

/**
 * 查單一基金淨值
 */
async function fetchFundNav(code) {
  const empty = { code, price: null, name: null, date: null, source: null }

  // ── 1. 鉅亨網 ──────────────────────────────────────────
  try {
    // 鉅亨的代碼格式：T3703Y → 去掉 T 前綴，取數字部分，加 'A' 前綴
    // T3703Y → A37037（觀察規律：T + NNNN + Y → A + NNNN + 0）
    // 實際對應需查詢，先用 search API
    const cnyes = await fetchCnyes(code)
    if (cnyes?.price) return { ...empty, ...cnyes, source: 'cnyes' }
  } catch (e) {
    console.error(`[fund-nav] cnyes error for ${code}:`, e.message)
  }

  // ── 2. 投信投顧公會 SITCA ─────────────────────────────
  try {
    const sitca = await fetchSitca(code)
    if (sitca?.price) return { ...empty, ...sitca, source: 'sitca' }
  } catch (e) {
    console.error(`[fund-nav] sitca error for ${code}:`, e.message)
  }

  return empty
}

// ── 鉅亨網 ─────────────────────────────────────────────────
async function fetchCnyes(code) {
  // Step1: 搜尋基金拿到鉅亨內部代碼
  const searchUrl = `https://fund.api.cnyes.com/fund/api/v2/search?search=${encodeURIComponent(code)}&limit=5`
  const sr = await fetch(searchUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.cnyes.com/' }
  })
  if (!sr.ok) return null

  const sd = await sr.json()
  const items = sd?.data?.items || sd?.items || []

  // 找出 fundCode 符合的條目
  const match = items.find(i =>
    (i.fundCode || '').toUpperCase() === code.toUpperCase() ||
    (i.code || '').toUpperCase() === code.toUpperCase()
  ) || items[0]

  if (!match) return null

  const cnyesId = match.cnyesCode || match.fundId || match.id
  const name = match.fundName || match.name || null
  if (!cnyesId) return { name, price: null, date: null }

  // Step2: 用內部代碼查最新淨值
  const navUrl = `https://fund.api.cnyes.com/fund/api/v2/funds/${cnyesId}/nav?format=json`
  const nr = await fetch(navUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.cnyes.com/' }
  })
  if (!nr.ok) return { name, price: null, date: null }

  const nd = await nr.json()
  const navData = nd?.data?.[0] || nd?.data || null
  if (!navData) return { name, price: null, date: null }

  const price = parseFloat(navData.nav || navData.price || navData.NAV) || null
  const date = navData.date || navData.navDate || null

  return { code, name: name || navData.name, price, date }
}

// ── 投信投顧公會 SITCA ─────────────────────────────────────
// 公會提供每日淨值查詢（HTML table），需解析
async function fetchSitca(code) {
  // 公會 API：https://www.sitca.org.tw/ROC/Industry/IN2413.aspx
  // 改用台灣基金評比網提供的 JSON 代理（每日更新）
  const url = `https://www.sitca.org.tw/ROC/Industry/IN2413.aspx?FUND_ID=${encodeURIComponent(code)}&txttype=2`

  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    }
  })
  if (!r.ok) return null

  const html = await r.text()

  // 解析 HTML：找淨值欄位
  // 公會頁面格式：<td>基金名稱</td><td>日期</td><td>淨值</td>
  const navMatch = html.match(/淨值[^<]*<\/td>\s*<td[^>]*>([\d,.]+)<\/td>/i)
    || html.match(/<td[^>]*>([\d,.]+)<\/td>\s*<td[^>]*>([\d,.]+)<\/td>/)

  const nameMatch = html.match(/基金全名[^<]*<\/[^>]+>\s*[^<]*<[^>]+>([^<]{4,60})<\//)
    || html.match(/FUND_ID[^"]*"[^"]*"[^>]*>([^<]{4,60})</)

  if (!navMatch) return null

  const price = parseFloat(navMatch[1]?.replace(/,/g, '')) || null
  const name = nameMatch?.[1]?.trim() || null

  // 找日期
  const dateMatch = html.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null

  return { code, name, price, date }
}
