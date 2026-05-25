/**
 * api/fund-nav.js — 台灣基金淨值查詢 + 關鍵字搜尋 Vercel Serverless
 *
 * GET /api/fund-nav?codes=T3703Y,T3201Y   → 查淨值
 * GET /api/fund-nav?search=國泰中小        → 搜尋基金列表
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  // ── 搜尋模式 ──────────────────────────────────────────
  if (search) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    const results = await searchFunds(search.trim())
    return res.status(200).json({ funds: results })
  }

  // ── 淨值查詢模式 ───────────────────────────────────────
  if (!codes) return res.status(400).json({ error: 'codes or search required' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)
  const results = await Promise.all(codeList.map(code => fetchFundNav(code)))
  return res.status(200).json({ funds: results })
}

// ── 關鍵字搜尋基金 ─────────────────────────────────────────
async function searchFunds(keyword) {
  // 1. 鉅亨搜尋 API（境內基金）
  try {
    const url = `https://fund.api.cnyes.com/fund/api/v2/search?search=${encodeURIComponent(keyword)}&limit=10`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.cnyes.com/' }
    })
    if (r.ok) {
      const data = await r.json()
      const items = data?.data?.items || data?.items || []
      if (items.length > 0) {
        return items.map(i => ({
          code:     i.fundCode || i.code || '',
          name:     i.fundName || i.name || '',
          cnyesId:  i.cnyesCode || i.fundId || i.id || null,
          currency: i.currency || 'TWD',
          company:  i.companyCh || i.company || '',
        })).filter(i => i.code)
      }
    }
  } catch (e) {
    console.error('[fund-nav] search error:', e.message)
  }

  // 2. Fallback：用投信公會的模糊查詢
  try {
    const url = `https://www.sitca.org.tw/ROC/Industry/IN2413.aspx?search=${encodeURIComponent(keyword)}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-TW,zh;q=0.9' }
    })
    if (r.ok) {
      const html = await r.text()
      // 解析 HTML table 裡的基金列表
      const rows = [...html.matchAll(/<tr[^>]*>.*?<\/tr>/gs)]
      const results = []
      for (const row of rows) {
        const cells = [...row[0].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m =>
          m[1].replace(/<[^>]+>/g, '').trim()
        )
        if (cells.length >= 2 && cells[0].match(/^[A-Z]\d{4}[A-Z]$/)) {
          results.push({ code: cells[0], name: cells[1] || cells[0], cnyesId: null, currency: 'TWD', company: '' })
        }
      }
      if (results.length > 0) return results.slice(0, 10)
    }
  } catch {}

  return []
}

// ── 查單一基金淨值 ─────────────────────────────────────────
async function fetchFundNav(code) {
  const empty = { code, price: null, name: null, date: null, source: null }

  try {
    const cnyes = await fetchCnyes(code)
    if (cnyes?.price) return { ...empty, ...cnyes, source: 'cnyes' }
  } catch (e) {
    console.error(`[fund-nav] cnyes error for ${code}:`, e.message)
  }

  try {
    const sitca = await fetchSitca(code)
    if (sitca?.price) return { ...empty, ...sitca, source: 'sitca' }
  } catch (e) {
    console.error(`[fund-nav] sitca error for ${code}:`, e.message)
  }

  return empty
}

// ── 鉅亨：搜尋 + 取淨值 ────────────────────────────────────
async function fetchCnyes(code) {
  const searchUrl = `https://fund.api.cnyes.com/fund/api/v2/search?search=${encodeURIComponent(code)}&limit=5`
  const sr = await fetch(searchUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.cnyes.com/' }
  })
  if (!sr.ok) return null

  const sd = await sr.json()
  const items = sd?.data?.items || sd?.items || []
  const match = items.find(i =>
    (i.fundCode || '').toUpperCase() === code.toUpperCase() ||
    (i.code || '').toUpperCase() === code.toUpperCase()
  ) || items[0]

  if (!match) return null

  const cnyesId = match.cnyesCode || match.fundId || match.id
  const name = match.fundName || match.name || null
  if (!cnyesId) return { name, price: null, date: null }

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

// ── 投信投顧公會 ────────────────────────────────────────────
async function fetchSitca(code) {
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
  const navMatch = html.match(/淨值[^<]*<\/td>\s*<td[^>]*>([\d,.]+)<\/td>/i)
    || html.match(/<td[^>]*>([\d,.]+)<\/td>\s*<td[^>]*>([\d,.]+)<\/td>/)
  if (!navMatch) return null

  const price = parseFloat(navMatch[1]?.replace(/,/g, '')) || null
  const nameMatch = html.match(/基金全名[^<]*<\/[^>]+>\s*[^<]*<[^>]+>([^<]{4,60})<\//)
  const name = nameMatch?.[1]?.trim() || null
  const dateMatch = html.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null

  return { code, name, price, date }
}
