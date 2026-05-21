/**
 * 股價與標的名稱查詢
 * 台股名稱：TWSE/TPEx OpenAPI（支援 CORS，免費）
 * 現價：/api/quote serverless
 */

const PRICE_CACHE = {}
const NAME_CACHE = {}
const PRICE_TTL = 60 * 1000
const NAME_TTL  = 60 * 60 * 1000

function yahooSymbol(symbol, market) {
  if (market === 'TW') return `${symbol}.TW`
  if (market === 'JP') return `${symbol}.T`
  return symbol
}

// ── 台股名稱：TWSE / TPEx OpenAPI ────────────────────────
async function fetchTWSEName(symbol) {
  const sym = symbol.trim().toUpperCase()
  const cacheKey = `TW:${sym}`
  if (NAME_CACHE[cacheKey] && Date.now() - NAME_CACHE[cacheKey].ts < NAME_TTL) {
    return NAME_CACHE[cacheKey].name
  }

  const tryJSON = async (url, codeField, nameField) => {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' }
      })
      if (!r.ok) { console.warn(`TWSE API ${url} returned ${r.status}`); return null }
      const list = await r.json()
      if (!Array.isArray(list)) { console.warn('TWSE API not array:', typeof list); return null }
      const found = list.find(item => (item[codeField] || '').trim() === sym)
      return found ? (found[nameField] || '').trim() || null : null
    } catch(e) {
      console.warn('TWSE fetch error:', e.message)
      return null
    }
  }

  // 1. 上市 TWSE
  let name = await tryJSON(
    'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
    '公司代號', '公司簡稱'
  )
  // 2. 上櫃 TPEx
  if (!name) name = await tryJSON(
    'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
    '公司代號', '公司簡稱'
  )

  console.log(`TWSE lookup [${sym}]:`, name || 'not found')
  if (name) NAME_CACHE[cacheKey] = { name, ts: Date.now() }
  return name
}

// ── Serverless /api/quote（現價 + 美股名稱）──────────────
async function fetchFromServerless(yahooSymbols) {
  try {
    const url = `/api/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`
    console.log('Calling serverless:', url)
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) { console.warn('serverless HTTP error:', res.status); return [] }
    const data = await res.json()
    console.log('Serverless response:', data)
    return data.quotes || []
  } catch (e) {
    console.warn('serverless fetch failed:', e.message)
    return []
  }
}

// ── 批次取得多檔現價 ──────────────────────────────────────
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

// ── 單一標的查詢（新增持倉時自動帶入名稱）──────────────────
export async function lookupSymbol(symbol, market) {
  if (!symbol || !market) return null
  const sym = symbol.trim().toUpperCase()

  if (market === 'TW') {
    // 台股：TWSE 查名稱 + serverless 查現價，同時發出
    const [twseName, serverlessResults] = await Promise.all([
      fetchTWSEName(sym),
      fetchFromServerless([yahooSymbol(sym, 'TW')])
    ])
    const r = serverlessResults[0]
    const name = twseName || r?.name || null
    const price = r?.price ?? null
    console.log(`lookupSymbol TW [${sym}]: name=${name}, price=${price}`)
    if (name || price) return { name: name || sym, price: price || 0 }
    return null
  }

  if (['US', 'JP'].includes(market)) {
    const results = await fetchFromServerless([yahooSymbol(sym, market)])
    const r = results[0]
    if (r?.name || r?.price) return { name: r.name || sym, price: r.price || 0 }
    return null
  }

  return null
}
