/**
 * 股價與標的名稱查詢
 * 全部走 /api/quote serverless（server 端無 CORS 限制）
 * 台股名稱由 server 端打 TWSE OpenAPI 取得中文名
 */

const PRICE_CACHE = {}
const NAME_CACHE  = {}
const PRICE_TTL = 60 * 1000       // 1 分鐘
const NAME_TTL  = 60 * 60 * 1000  // 1 小時

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol
}

async function fetchFromServerless(yahooSymbols) {
  try {
    const res = await fetch(
      `/api/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`,
      { signal: AbortSignal.timeout(12000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.quotes || []
  } catch (e) {
    console.warn('serverless quote failed:', e.message)
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
  if (!['TW', 'US', 'JP'].includes(market)) return null

  const sym = symbol.trim().toUpperCase()
  const ySym = yahooSymbol(sym, market)

  // 先查快取
  const nameKey = `${market}:${sym}`
  const cachedName = NAME_CACHE[nameKey]
  const cachedPrice = PRICE_CACHE[nameKey]
  if (
    cachedName && Date.now() - cachedName.ts < NAME_TTL &&
    cachedPrice && Date.now() - cachedPrice.ts < PRICE_TTL
  ) {
    return { name: cachedName.name, price: cachedPrice.price }
  }

  const results = await fetchFromServerless([ySym])
  const r = results[0]

  if (!r) return null

  const name = r.name || null
  const price = r.price ?? null

  if (name) NAME_CACHE[nameKey] = { name, ts: Date.now() }
  if (price) PRICE_CACHE[nameKey] = { price, ts: Date.now() }

  if (name || price) return { name: name || sym, price: price || 0 }
  return null
}
