/**
 * 股價與標的名稱查詢
 * 股票/ETF/加密 走 /api/quote serverless
 * 基金 走 /api/fund-nav serverless
 */

const PRICE_CACHE = {}
const NAME_CACHE  = {}
const PRICE_TTL   = 60 * 1000
const NAME_TTL    = 60 * 60 * 1000
const FUND_TTL    = 4 * 60 * 60 * 1000  // 基金快取 4h（每日一次）

// ─────────────────────────────────────────────────────────────
// 股票 / ETF helpers
// ─────────────────────────────────────────────────────────────

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
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────
// 基金 helpers
// ─────────────────────────────────────────────────────────────

async function fetchFromFundNav(codes) {
  try {
    const res = await fetch(
      `/api/fund-nav?codes=${encodeURIComponent(codes.join(','))}`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.funds || []
  } catch (e) {
    console.warn('[quote] fund-nav error:', e.message)
    return []
  }
}

/**
 * 批次查基金淨值（供 fetchQuotes 內部呼叫）
 */
async function fetchFundNavsBatch(holdings) {
  const now = Date.now()
  const prices = {}
  const toFetch = []

  for (const h of holdings) {
    const key = `FUND:${h.symbol}`
    if (PRICE_CACHE[key] && now - PRICE_CACHE[key].ts < FUND_TTL) {
      prices[key] = PRICE_CACHE[key].price
    } else {
      toFetch.push(h)
    }
  }

  if (!toFetch.length) return prices

  const codes = toFetch.map(h => h.symbol)
  const results = await fetchFromFundNav(codes)

  for (const f of results) {
    if (f.price == null) continue
    const key = `FUND:${f.code}`
    PRICE_CACHE[key] = { price: f.price, name: f.name, ts: now }
    prices[key] = f.price
  }

  return prices
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * 批次查所有持倉的現價
 */
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

  // 基金走 fund-nav API
  const fundHoldings = toFetch.filter(h => h.market === 'FUND')
  if (fundHoldings.length > 0) {
    const fundPrices = await fetchFundNavsBatch(fundHoldings)
    Object.assign(prices, fundPrices)
    for (const [key, price] of Object.entries(fundPrices)) {
      PRICE_CACHE[key] = { ...PRICE_CACHE[key], price, ts: now }
    }
  }

  // 股票 / ETF 走原本 quote API
  const supported = toFetch.filter(h => ['TW', 'US', 'JP'].includes(h.market))
  if (supported.length > 0) {
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
  }

  return prices
}

/**
 * 查單一股票代號（自動帶入名稱用）
 */
export async function lookupSymbol(symbol, market) {
  if (!symbol || !market) return null
  if (!['TW', 'US', 'JP'].includes(market)) return null

  const sym = symbol.trim().toUpperCase()
  const ySym = yahooSymbol(sym, market)

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

  if (r.name)  NAME_CACHE[nameKey]  = { name: r.name, ts: Date.now() }
  if (r.price) PRICE_CACHE[nameKey] = { price: r.price, ts: Date.now() }

  if (r.name || r.price) return { name: r.name || sym, price: r.price || 0 }
  return null
}

/**
 * 查單一基金淨值（新增持倉後自動帶入現價用）
 * @param {string} code  例如 T3703Y
 */
export async function fetchSingleFundNav(code) {
  if (!code) return { price: null, name: null, date: null }

  const key = `FUND:${code}`
  const now = Date.now()
  const cached = PRICE_CACHE[key]
  if (cached && now - cached.ts < FUND_TTL) {
    return { price: cached.price, name: cached.name || null, date: null }
  }

  const results = await fetchFromFundNav([code])
  const f = results[0]
  if (!f) return { price: null, name: null, date: null }

  if (f.price != null) {
    PRICE_CACHE[key] = { price: f.price, name: f.name, ts: now }
  }
  return { price: f.price ?? null, name: f.name ?? null, date: f.date ?? null }
}
