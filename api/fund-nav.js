/**
 * api/fund-nav.js — 台灣基金淨值查詢
 *
 * GET /api/fund-nav?codes=T3703Y
 * GET /api/fund-nav?search=...   → 前端本地 DB，這裡回空
 *
 * 淨值來源：Yahoo Finance（帶 crumb/cookie 繞過 429）
 */

const CODE_TO_YAHOO = {
  'T3703Y': 'F0HKG05WWH.FO',
  'T3707Y': 'F0HKG05WX4.FO',
  'T3201Y': 'F0HKG05WV1.FO',
  'T3207Y': 'F0HKG05WV2.FO',
  'T3604Y': 'F0HKG05WW8.FO',
}

// ── 取得 Yahoo crumb + cookie ─────────────────────────────────
let _crumbCache = null
let _crumbTs    = 0
const CRUMB_TTL = 55 * 60 * 1000  // 55 分鐘

async function getYahooCrumb() {
  const now = Date.now()
  if (_crumbCache && now - _crumbTs < CRUMB_TTL) return _crumbCache

  // Step1: 取 cookie
  const r1 = await fetch('https://fc.yahoo.com', {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow',
  })
  const cookie = r1.headers.get('set-cookie') || ''

  // Step2: 用 cookie 取 crumb
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookie,
    },
  })
  const crumb = await r2.text()
  console.log('[fund-nav] crumb:', crumb, 'cookie len:', cookie.length)

  if (crumb && crumb.length > 2 && !crumb.startsWith('<')) {
    _crumbCache = { crumb: crumb.trim(), cookie }
    _crumbTs    = now
    return _crumbCache
  }
  return null
}

// ── 查 Yahoo Finance 基金淨值 ─────────────────────────────────
async function fetchYahooNav(yahooSymbol) {
  const auth   = await getYahooCrumb()
  const crumb  = auth?.crumb || ''
  const cookie = auth?.cookie || ''

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`
  const r   = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Cookie': cookie,
    },
  })

  console.log(`[fund-nav] Yahoo ${yahooSymbol} HTTP ${r.status}`)
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`)

  const data   = await r.json()
  const result = data?.chart?.result?.[0]
  if (!result) return null

  const meta  = result.meta
  const price = meta?.regularMarketPrice || meta?.previousClose || null
  const date  = meta?.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : null
  const name  = meta?.longName || meta?.shortName || null

  console.log(`[fund-nav] Yahoo ${yahooSymbol} price=${price} name=${name}`)
  return price ? { price, date, name } : null
}

// ── 用 Yahoo 搜尋找 symbol（對照表沒有時用）────────────────────
async function searchYahooSymbol(code) {
  const auth   = await getYahooCrumb()
  const cookie = auth?.cookie || ''
  const crumb  = auth?.crumb  || ''

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(code)}&lang=zh-TW&region=TW&quotesCount=5&newsCount=0&crumb=${encodeURIComponent(crumb)}`
  const r   = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookie,
    },
  })
  if (!r.ok) return null

  const data   = await r.json()
  const quotes = data?.quotes || []
  const fund   = quotes.find(q => q.quoteType === 'MUTUALFUND' || q.symbol?.endsWith('.FO'))
    || quotes[0]
  console.log(`[fund-nav] search ${code} → ${fund?.symbol}`)
  return fund?.symbol || null
}

// ── 主 handler ────────────────────────────────────────────────
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
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    try {
      let yahooSym = CODE_TO_YAHOO[code.toUpperCase()]
      if (!yahooSym) {
        yahooSym = await searchYahooSymbol(code)
      }
      if (!yahooSym) return empty

      const nav = await fetchYahooNav(yahooSym)
      if (nav) return { code, ...nav, source: 'yahoo' }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  return res.status(200).json({ funds: results })
}
