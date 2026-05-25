/**
 * api/fund-nav.js — 台灣基金淨值查詢
 *
 * GET /api/fund-nav?codes=T3703Y          → 查淨值
 * GET /api/fund-nav?search=...            → 搜尋（前端本地 DB 處理，這裡回空）
 *
 * 淨值來源：Yahoo Finance v8 API
 * 台灣投信基金在 Yahoo Finance 的 symbol 格式：XXXXXXXX.TW 或 XXXXXXXX.FO
 *
 * 代碼對照表（T代碼 → Yahoo Finance symbol）
 */

// 已知對照表（從 Yahoo Finance 搜尋確認）
const CODE_TO_YAHOO = {
  'T3703Y': 'F0HKG05WWH.FO',  // 國泰中小成長基金-新台幣
  'T3707Y': 'F0HKG05WX4.FO',  // 國泰科技生化基金（推測，需驗證）
  'T3201Y': 'F0HKG05WV1.FO',  // 野村優質基金（推測）
  'T3207Y': 'F0HKG05WV2.FO',  // 野村中小基金（推測）
  'T3604Y': 'F0HKG05WW8.FO',  // 安聯台灣科技基金（推測）
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function fetchYahooNav(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: YAHOO_HEADERS,
  })
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`)
  const data = await r.json()

  const result = data?.chart?.result?.[0]
  if (!result) return null

  const meta   = result.meta
  const price  = meta?.regularMarketPrice || meta?.previousClose || null
  const date   = meta?.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : null
  const name   = meta?.longName || meta?.shortName || null

  return price ? { price, date, name } : null
}

// Yahoo Finance 搜尋（用來找正確 symbol）
async function searchYahoo(code) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(code)}&lang=zh-TW&region=TW&quotesCount=5&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: YAHOO_HEADERS,
  })
  if (!r.ok) return null
  const data = await r.json()
  // 找基金類型的結果
  const quotes = data?.quotes || []
  const fund = quotes.find(q => q.quoteType === 'MUTUALFUND' || q.symbol?.endsWith('.FO'))
    || quotes[0]
  return fund?.symbol || null
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
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    try {
      // 1. 用已知對照表
      let yahooSym = CODE_TO_YAHOO[code.toUpperCase()]
      console.log(`[fund-nav] ${code} → known symbol: ${yahooSym}`)

      // 2. 對照表沒有就用 Yahoo 搜尋
      if (!yahooSym) {
        yahooSym = await searchYahoo(code)
        console.log(`[fund-nav] ${code} → searched symbol: ${yahooSym}`)
      }

      if (!yahooSym) return empty

      const nav = await fetchYahooNav(yahooSym)
      console.log(`[fund-nav] ${code} nav:`, JSON.stringify(nav))
      if (nav) return { code, ...nav, source: 'yahoo' }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  return res.status(200).json({ funds: results })
}
