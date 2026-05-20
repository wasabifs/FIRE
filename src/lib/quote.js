/**
 * 即時報價 API
 * 台股: Yahoo Finance (TW) — 免費無需 key
 * 美股: Yahoo Finance (US)
 * 日股: Yahoo Finance (.T)
 */

const CACHE = {}
const CACHE_TTL = 60 * 1000 // 1分鐘快取

function cacheKey(symbol, market) { return `${market}:${symbol}` }

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol // US
}

async function fetchYahoo(symbols) {
  // 使用 Yahoo Finance v8 (公開endpoint，不需要key)
  const joined = symbols.join(',')
  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${joined}&range=1d&interval=1d`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    return data?.spark?.result || []
  } catch (e) {
    console.warn('Yahoo Finance fetch failed:', e)
    return []
  }
}

async function fetchYahooQuote(symbols) {
  const joined = symbols.join(',')
  const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${joined}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    return data?.quoteResponse?.result || []
  } catch {
    // fallback: try v7
    try {
      const url2 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${joined}`
      const res2 = await fetch(url2, { signal: AbortSignal.timeout(6000) })
      const data2 = await res2.json()
      return data2?.quoteResponse?.result || []
    } catch (e) {
      console.warn('Yahoo Finance quote failed:', e)
      return []
    }
  }
}

/**
 * 批次取得多檔報價
 * holdings: [{ symbol, market }]
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

  // Group by market for efficiency
  const byMarket = {}
  for (const h of toFetch) {
    if (!byMarket[h.market]) byMarket[h.market] = []
    byMarket[h.market].push(h)
  }

  const allYahooSymbols = toFetch
    .filter(h => ['TW','US','JP'].includes(h.market))
    .map(h => yahooSymbol(h.symbol, h.market))

  if (allYahooSymbols.length > 0) {
    const results = await fetchYahooQuote(allYahooSymbols)
    for (const r of results) {
      const price = r.regularMarketPrice || r.postMarketPrice
      if (!price) continue
      // Map back to our key
      const h = toFetch.find(h => yahooSymbol(h.symbol, h.market) === r.symbol)
      if (h) {
        const key = cacheKey(h.symbol, h.market)
        CACHE[key] = { price, ts: now }
        prices[key] = price
      }
    }
  }

  return prices
}
