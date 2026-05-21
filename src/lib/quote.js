/**
 * 股價與標的名稱查詢
 *
 * 台股名稱：TWSE/TPEx OpenAPI（支援 CORS，免費，直接前端打）
 * 美股名稱：Yahoo Finance via /api/quote serverless
 * 現價：/api/quote serverless（台股 + 美股）
 */

// ── 快取 ──────────────────────────────────────────────────
const PRICE_CACHE = {}
const NAME_CACHE = {}
const PRICE_TTL = 60 * 1000   // 1 分鐘
const NAME_TTL  = 60 * 60 * 1000  // 1 小時

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol
}

// ── 台股名稱：TWSE / TPEx OpenAPI（有 CORS，直接打）────────
async function fetchTWSEName(symbol) {
  const sym = symbol.trim().toUpperCase()
  if (NAME_CACHE[sym] && Date.now() - NAME_CACHE[sym].ts < NAME_TTL) {
    return NAME_CACHE[sym].name
  }

  // 解析 TWSE/TPEx 回傳的 JSON
  const tryJSON = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return null
      const list = await r.json()
      const found = list.find(item =>
        (item['公司代號'] || item['SecuritiesCompanyCode'] || '').trim() === sym
      )
      return found
        ? (found['公司簡稱'] || found['CompanyAbbreviationName'] || '').trim() || null
        : null
    } catch { return null }
  }

  // 1. 上市（TWSE）
  let name = await tryJSON('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')
  // 2. 上櫃（TPEx）
  if (!name) name = await tryJSON('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')

  if (name) NAME_CACHE[sym] = { name, ts: Date.now() }
  return name
}

// ── /api/quote serverless（現價 + 美股名稱）────────────────
async function fetchFromServerless(yahooSymbols) {
  try {
    const res = await fetch(
      `/api/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.quotes || []
  } catch (e) {
    console.warn('serverless quote failed:', e)
    return []
  }
}

// ── 批次取得多檔現價 ──────────────────────────────────────
// holdings: [{ symbol, market, asset_type }]
// 回傳 Map<"market:symbol", price>
export async function fetchQuotes(holdings) {
  const now = Date.now()
  const prices = {}
  const toFetch = []

  for (const h of holdings) {
    if (!h.symbol || h.asset_type === 'cash') continue
    const key = `${h.market}:${h.symbol}`
    if (PRICE_CACHE[key] && now - PRICE_CACHE[key].ts < PRICE_TTL) {
      prices[key] = PRICE_CACHE[key].price
    } else {
      toFetch.push(h)
    }
  }

  if (toFetch.length === 0) return prices

  const supported = toFetch.filter(h => ['TW', 'US', 'JP'].includes(h.market))
  if (supported.length === 0) return prices

  const yahooSymbols = supported.map(h => yahooSymbol(h.symbol, h.market))
  const results = await fetchFromServerless(yahooSymbols)

  for (const r of results) {
    if (r.price == null) continue
    const h = supported.find(h => yahooSymbol(h.symbol, h.market) === r.symbol)
    if (h) {
      const key = `${h.market}:${h.symbol}`
      PRICE_CACHE[key] = { price: r.price, ts: now }
      prices[key] = r.price
    }
  }

  return prices
}

// ── 單一標的查詢（新增持倉時自動帶入名稱 + 現價）──────────
// 回傳 { name, price } 或 null
export async function lookupSymbol(symbol, market) {
  if (!symbol || !market) return null
  const sym = symbol.trim().toUpperCase()

  // 台股：先用 TWSE API 查名稱（準確、中文）
  if (market === 'TW') {
    const [twseName, serverlessResult] = await Promise.all([
      fetchTWSEName(sym),
      fetchFromServerless([yahooSymbol(sym, 'TW')])
    ])
    const price = serverlessResult[0]?.price ?? null
    const name = twseName || serverlessResult[0]?.name || null
    if (name || price) return { name: name || sym, price: price || 0 }
    return null
  }

  // 美股 / 日股：走 serverless
  if (['US', 'JP'].includes(market)) {
    const results = await fetchFromServerless([yahooSymbol(sym, market)])
    const r = results[0]
    if (r?.name || r?.price) {
      return { name: r.name || sym, price: r.price || 0 }
    }
    return null
  }

  return null
}
