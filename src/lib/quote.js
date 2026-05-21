/**
 * 即時報價 — 透過 Vercel Serverless Function (/api/quote) 查詢
 * 避免瀏覽器直接呼叫 Yahoo Finance 的 CORS 問題
 */

const CACHE = {}
const CACHE_TTL = 60 * 1000 // 1 分鐘快取

function cacheKey(symbol, market) { return `${market}:${symbol}` }

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol // US、CRYPTO 等
}

/**
 * 呼叫 /api/quote serverless function
 * symbols: ["0050.TW", "AAPL", "7203.T"]
 * 回傳 [{ symbol, price, name, currency, changePercent }]
 */
async function fetchFromAPI(yahooSymbols) {
  try {
    const res = await fetch(
      `/api/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`API error ${res.status}`)
    const data = await res.json()
    return data.quotes || []
  } catch (e) {
    console.warn('fetchFromAPI failed:', e)
    return []
  }
}

/**
 * 批次取得多檔報價
 * holdings: [{ symbol, market, asset_type }]
 * 回傳 Map<"market:symbol", price>
 */
export async function fetchQuotes(holdings) {
  const now = Date.now()
  const prices = {}
  const toFetch = []

  for (const h of holdings) {
    if (!h.symbol || h.asset_type === 'cash') continue
    const key = cacheKey(h.symbol, h.market)
    if (CACHE[key] && now - CACHE[key].ts < CACHE_TTL) {
      prices[key] = CACHE[key].price
    } else {
      toFetch.push(h)
    }
  }

  if (toFetch.length === 0) return prices

  // 只處理 Yahoo Finance 支援的市場
  const supported = toFetch.filter(h => ['TW', 'US', 'JP'].includes(h.market))
  if (supported.length === 0) return prices

  const yahooSymbols = supported.map(h => yahooSymbol(h.symbol, h.market))
  const results = await fetchFromAPI(yahooSymbols)

  for (const r of results) {
    if (r.price == null) continue
    const h = supported.find(h => yahooSymbol(h.symbol, h.market) === r.symbol)
    if (h) {
      const key = cacheKey(h.symbol, h.market)
      CACHE[key] = { price: r.price, ts: now }
      prices[key] = r.price
    }
  }

  return prices
}

/**
 * 查詢單一標的的名稱與現價（新增持倉時自動帶入）
 * 回傳 { name, price, currency } 或 null
 */
export async function lookupSymbol(symbol, market) {
  if (!symbol || !market) return null
  if (!['TW', 'US', 'JP'].includes(market)) return null

  const ySym = yahooSymbol(symbol.trim().toUpperCase(), market)
  const results = await fetchFromAPI([ySym])

  if (results.length > 0 && results[0].name) {
    return {
      name: results[0].name,
      price: results[0].price ?? 0,
      currency: results[0].currency ?? 'TWD',
    }
  }
  return null
}
