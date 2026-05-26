/**
 * api/fund-nav.js — 台灣基金淨值查詢
 * GET /api/fund-nav?codes=T3703Y,T3201Y
 *
 * 資料來源：Morningstar 公開 API（不需要 API key）
 * SecId 即 Yahoo symbol 去掉 :FO
 */

// T代碼 → Morningstar SecId 對照
const CODE_TO_SECID = {
  'T3703Y': 'F0HKG05WWH',  // 國泰中小成長基金-新台幣
  'T3707Y': 'F0HKG05WWI',  // 國泰科技生化基金
  'T3201Y': 'F0HKG05X20',  // 野村優質基金-累積類型新臺幣
  'T3207Y': 'F0HKG05WXW',  // 野村中小基金-累積類型
  'T3604Y': 'F0HKG05X22',  // 安聯台灣科技基金
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

async function fetchMorningstarNav(secId) {
  // Morningstar 公開 screener API，用 SecId 查最新淨值
  const url = `https://lt.morningstar.com/api/rest.svc/9vehuxllxs/security/screener?page=1&pageSize=1&sortOrder=LegalName%20asc&outputType=json&version=1&languageId=zh-TW&currencyId=TWD&universeIds=FOTW%24%24ALL&securityDataPoints=SecId%2CLegalName%2CClosePrice%2CClosePriceDate%2CPriceCurrency&filters=SecId%3AIN%3A${secId}`

  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://tw.morningstar.com/',
      'Origin': 'https://tw.morningstar.com',
    },
  })

  console.log(`[fund-nav] Morningstar ${secId} HTTP ${r.status}`)
  if (!r.ok) throw new Error(`Morningstar HTTP ${r.status}`)

  const data = await r.json()
  console.log(`[fund-nav] Morningstar ${secId} body:`, JSON.stringify(data).substring(0, 300))

  const rows = data?.rows || data?.results || []
  const row  = rows[0]
  if (!row) return null

  const price = parseFloat(row.ClosePrice || row.closePrice || row.NAV || 0) || null
  const date  = row.ClosePriceDate || row.closePriceDate || null
  const name  = row.LegalName || row.legalName || null

  return price ? { price, date, name } : null
}

// fallback: 用 Morningstar 歷史 NAV API
async function fetchMorningstarNavHistory(secId) {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const url = `https://lt.morningstar.com/api/rest.svc/9vehuxllxs/security_details/${secId}/performance/nav?currencyId=TWD&idtype=msid&frequency=daily&startDate=${weekAgo}&endDate=${today}&outputType=json`

  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': UA, 'Referer': 'https://tw.morningstar.com/' },
  })

  console.log(`[fund-nav] MS history ${secId} HTTP ${r.status}`)
  if (!r.ok) return null

  const data  = await r.json()
  const navs  = data?.navs || data?.Nav || data?.data || []
  const last  = Array.isArray(navs) ? navs[navs.length - 1] : null

  if (!last) return null

  const price = parseFloat(last.nav || last.NAV || last.value || last[1] || 0) || null
  const date  = last.date || last.Date || null

  console.log(`[fund-nav] MS history ${secId}: price=${price}`)
  return price ? { price, date, name: null } : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  if (search) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ funds: [] })
  }

  if (!codes) return res.status(400).json({ error: 'codes required' })
  res.setHeader('Cache-Control', 'no-store')  // debug 期間不快取

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    const secId = CODE_TO_SECID[code.toUpperCase()]
    if (!secId) { console.warn(`[fund-nav] no secId for ${code}`); return empty }

    try {
      // 先試 screener API
      const nav = await fetchMorningstarNav(secId)
      if (nav?.price) return { code, ...nav, source: 'morningstar' }
    } catch (e) {
      console.error(`[fund-nav] screener error ${code}:`, e.message)
    }

    try {
      // fallback: history API
      const nav = await fetchMorningstarNavHistory(secId)
      if (nav?.price) return { code, ...nav, source: 'morningstar-history' }
    } catch (e) {
      console.error(`[fund-nav] history error ${code}:`, e.message)
    }

    return empty
  }))

  return res.status(200).json({ funds: results })
}
