/**
 * api/fund-nav.js — 台灣基金淨值查詢
 * GET /api/fund-nav?codes=T3703Y
 * GET /api/fund-nav?debug=1&codes=T3703Y  → 回傳完整 Yahoo response 供 debug
 */

const CODE_TO_YAHOO = {
  'T3703Y': 'F0HKG05WWH:FO',
  'T3707Y': 'F0HKG05WWI:FO',
  'T3201Y': 'F0HKG05X20:FO',
  'T3207Y': 'F0HKG05WXW:FO',
  'T3604Y': 'F0HKG05X22:FO',
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let _crumb = null, _cookie = '', _crumbTs = 0
const CRUMB_TTL = 50 * 60 * 1000

async function getYahooCrumb() {
  if (_crumb && Date.now() - _crumbTs < CRUMB_TTL) return { crumb: _crumb, cookie: _cookie }
  const r1 = await fetch('https://fc.yahoo.com', {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': UA }, redirect: 'follow',
  })
  _cookie = (r1.headers.get('set-cookie') || '').split(',').map(s => s.split(';')[0]).join('; ')
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': UA, 'Cookie': _cookie },
  })
  const crumb = (await r2.text()).trim()
  if (crumb && crumb.length > 2 && !crumb.includes('<')) {
    _crumb = crumb; _crumbTs = Date.now()
  }
  console.log('[fund-nav] crumb ok:', !!_crumb)
  return { crumb: _crumb, cookie: _cookie }
}

async function fetchYahooRaw(yahooSymbol) {
  const { crumb, cookie } = await getYahooCrumb()
  const sym = encodeURIComponent(yahooSymbol)
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Cookie': cookie },
  })
  console.log(`[fund-nav] chart ${yahooSymbol} HTTP ${r.status}`)
  const text = await r.text()
  // 只 log 前 500 字，避免 log 太大
  console.log(`[fund-nav] chart body:`, text.substring(0, 500))
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`)
  return JSON.parse(text)
}

function extractPrice(data) {
  // 嘗試各種可能的 response 結構
  const result = data?.chart?.result?.[0]
  if (!result) return null

  const meta = result.meta || {}
  // 基金淨值通常在 regularMarketPrice
  const candidates = [
    meta.regularMarketPrice,
    meta.previousClose,
    meta.chartPreviousClose,
    result.indicators?.quote?.[0]?.close?.filter(Boolean)?.slice(-1)?.[0],
    result.indicators?.adjclose?.[0]?.adjclose?.filter(Boolean)?.slice(-1)?.[0],
  ]
  console.log('[fund-nav] price candidates:', JSON.stringify(candidates))

  const price = candidates.find(v => v != null && v > 0)
  const date  = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : null
  const name  = meta.longName || meta.shortName || null

  return price ? { price, date, name } : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search, debug } = req.query

  if (search) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ funds: [] })
  }

  if (!codes) return res.status(400).json({ error: 'codes required' })
  res.setHeader('Cache-Control', 'no-store') // debug 期間關快取

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    try {
      const yahooSym = CODE_TO_YAHOO[code.toUpperCase()]
      if (!yahooSym) return empty

      const data = await fetchYahooRaw(yahooSym)

      // debug 模式：回傳完整 response
      if (debug) return { code, yahooSym, raw: data }

      const nav = extractPrice(data)
      if (nav) return { code, ...nav, source: 'yahoo' }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  return res.status(200).json({ funds: results })
}
