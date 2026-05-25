/**
 * lib/fundQuote.js
 * 台灣基金淨值抓取
 * 走 /api/fund-nav serverless，帶代碼（如 T3703Y）
 */

const FUND_CACHE = {}
const FUND_TTL   = 4 * 60 * 60 * 1000  // 4h（基金每日一次，快取寬鬆一點）

/**
 * 查多檔基金淨值
 * @param {Array<{symbol:string, name:string}>} holdings  market==='FUND' 的持倉
 * @returns {Object} { 'FUND:T3703Y': 344.41, ... }
 */
export async function fetchFundNavs(holdings) {
  const now = Date.now()
  const prices = {}
  const toFetch = []

  for (const h of holdings) {
    const key = `FUND:${h.symbol}`
    if (FUND_CACHE[key] && now - FUND_CACHE[key].ts < FUND_TTL) {
      prices[key] = FUND_CACHE[key].price
    } else {
      toFetch.push(h)
    }
  }

  if (!toFetch.length) return prices

  const codes = toFetch.map(h => h.symbol).join(',')
  try {
    const res = await fetch(
      `/api/fund-nav?codes=${encodeURIComponent(codes)}`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return prices

    const data = await res.json()
    for (const f of (data.funds || [])) {
      if (f.price == null) continue
      const key = `FUND:${f.code}`
      FUND_CACHE[key] = { price: f.price, ts: now }
      prices[key] = f.price
    }
  } catch (e) {
    console.warn('[fundQuote] fetch error:', e.message)
  }

  return prices
}

/**
 * 查單一基金淨值（用於新增持倉後自動帶入現價）
 * @param {string} code  例如 T3703Y
 * @returns {Promise<{price:number|null, name:string|null, date:string|null}>}
 */
export async function fetchSingleFundNav(code) {
  if (!code) return { price: null, name: null, date: null }

  const key = `FUND:${code}`
  const now = Date.now()
  if (FUND_CACHE[key] && now - FUND_CACHE[key].ts < FUND_TTL) {
    return { price: FUND_CACHE[key].price, name: FUND_CACHE[key].name || null, date: null }
  }

  try {
    const res = await fetch(
      `/api/fund-nav?codes=${encodeURIComponent(code)}`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return { price: null, name: null, date: null }

    const data = await res.json()
    const f = data.funds?.[0]
    if (!f) return { price: null, name: null, date: null }

    if (f.price != null) {
      FUND_CACHE[key] = { price: f.price, name: f.name, ts: now }
    }
    return { price: f.price, name: f.name, date: f.date }
  } catch {
    return { price: null, name: null, date: null }
  }
}
