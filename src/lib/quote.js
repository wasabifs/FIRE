/**
 * 即時報價 API
 * 台股: Yahoo Finance (TW) — 免費無需 key
 * 美股: Yahoo Finance (US)
 * 日股: Yahoo Finance (.T)
 *
 * 注意：Yahoo Finance 直接在瀏覽器 fetch 會遇到 CORS 問題。
 * 使用 allorigins 或 corsproxy.io 作為代理，或改用支援 CORS 的免費 API。
 */

const CACHE = {}
const CACHE_TTL = 60 * 1000 // 1分鐘快取

function cacheKey(symbol, market) { return `${market}:${symbol}` }

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol // US, CRYPTO 等
}

/**
 * 透過 Yahoo Finance query2（支援部分 CORS）取得多檔報價
 */
async function fetchYahooQuoteDirect(yahooSymbols) {
  const joined = yahooSymbols.join(',')
  // query2 比 query1 較少限制
  const url = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${joined}&fields=regularMarketPrice,shortName,longName,currency`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data?.quoteResponse?.result || []
  } catch (e) {
    console.warn('Yahoo Finance query2 failed:', e)
    return []
  }
}

/**
 * 備用：透過 allorigins proxy 繞過 CORS
 */
async function fetchYahooQuoteViaProxy(yahooSymbols) {
  const joined = yahooSymbols.join(',')
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(joined)}&fields=regularMarketPrice,shortName,longName`
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
    const wrapper = await res.json()
    const data = JSON.parse(wrapper.contents)
    return data?.quoteResponse?.result || []
  } catch (e) {
    console.warn('Yahoo Finance via proxy failed:', e)
    return []
  }
}

/**
 * 批次取得多檔報價
 * holdings: [{ symbol, market }]
 * 回傳 Map<"market:symbol", { price, name }>
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

  // 只處理有報價 API 支援的市場
  const supported = toFetch.filter(h => ['TW', 'US', 'JP'].includes(h.market))
  if (supported.length === 0) return prices

  const yahooSymbols = supported.map(h => yahooSymbol(h.symbol, h.market))

  // 先嘗試直接 fetch
  let results = await fetchYahooQuoteDirect(yahooSymbols)

  // 若失敗，嘗試 proxy
  if (results.length === 0) {
    results = await fetchYahooQuoteViaProxy(yahooSymbols)
  }

  for (const r of results) {
    const price = r.regularMarketPrice || r.postMarketPrice
    if (!price) continue
    const h = supported.find(h => yahooSymbol(h.symbol, h.market) === r.symbol)
    if (h) {
      const key = cacheKey(h.symbol, h.market)
      CACHE[key] = { price, ts: now }
      prices[key] = price
    }
  }

  return prices
}

/**
 * 查詢單一標的名稱（填入代號後自動帶入）
 * 回傳 { name, price, currency } 或 null
 */
export async function lookupSymbol(symbol, market) {
  if (!symbol || !market) return null
  const ySym = yahooSymbol(symbol.trim().toUpperCase(), market)

  // 嘗試直接 fetch
  let results = await fetchYahooQuoteDirect([ySym])
  if (results.length === 0) {
    results = await fetchYahooQuoteViaProxy([ySym])
  }

  if (results.length > 0) {
    const r = results[0]
    return {
      name: r.shortName || r.longName || symbol.toUpperCase(),
      price: r.regularMarketPrice || 0,
      currency: r.currency || 'TWD',
    }
  }
  return null
}
