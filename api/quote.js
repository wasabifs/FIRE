// api/quote.js — Vercel Serverless Function
const FINNHUB_KEY = 'd877iipr01ql0hskkbqgd877iipr01ql0hskkbr0'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols, rates } = req.query

  // ── 匯率模式 ──
  if (rates) {
    const currencies = rates.split(',').map(s => s.trim()).filter(Boolean)
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/TWD', { signal: AbortSignal.timeout(6000) })
      if (!r.ok) throw new Error(`er-api HTTP ${r.status}`)
      const data = await r.json()
      const result = { TWD: 1 }
      for (const c of currencies) {
        if (c === 'TWD') continue
        const rateToTWD = data.rates?.[c]
        result[c] = rateToTWD ? +(1 / rateToTWD).toFixed(4) : null
      }
      return res.status(200).json({ rates: result })
    } catch {
      return res.status(200).json({ rates: { TWD: 1, USD: 32.5, JPY: 0.22 } })
    }
  }

  // ── 報價模式 ──
  if (!symbols) return res.status(400).json({ error: 'symbols or rates required' })
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (!symbolList.length) return res.status(400).json({ error: 'no symbols' })

  // 台股全部一起撈（避免重複打 API）
  const twSymbols = symbolList.filter(s => s.endsWith('.TW'))
  const otherSymbols = symbolList.filter(s => !s.endsWith('.TW'))

  // 預先取台股資料（一次取全部）
  const twData = twSymbols.length > 0 ? await fetchAllTWSE() : { stock: [], etf: [], otc: [], otcEtf: [] }

  const quotes = await Promise.all(symbolList.map(sym => {
    if (sym.endsWith('.TW')) return resolveTWSE(sym, twData)
    return fetchFinnhub(sym)
  }))

  return res.status(200).json({ quotes })
}

// ── 一次取得所有台股資料 ──────────────────────────────────────
async function fetchAllTWSE() {
  const result = { stock: [], etf: [], otc: [], otcEtf: [] }

  const fetcher = async (url) => {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      })
      return r.ok ? await r.json() : []
    } catch { return [] }
  }

  const [stock, etf, otc, otcEtf] = await Promise.all([
    // 上市一般股
    fetcher('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
    // 上市 ETF（含 0056 等）
    fetcher('https://openapi.twse.com.tw/v1/exchangeReport/ETF_QUOTES'),
    // 上櫃一般股
    fetcher('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'),
    // 上櫃 ETF
    fetcher('https://www.tpex.org.tw/openapi/v1/tpex_etf_quotes'),
  ])

  result.stock = stock
  result.etf   = etf
  result.otc   = otc
  result.otcEtf = otcEtf
  return result
}

// ── 從已取得的資料中找出個股 ────────────────────────────────
async function resolveTWSE(sym, twData) {
  const code = sym.replace('.TW', '')
  const empty = { symbol: sym, price: null, name: null, currency: 'TWD' }

  // 欄位名稱 helper：支援不同 API 的欄位命名
  const getPrice = (item) =>
    parseFloat(item.ClosingPrice || item.Close || item.收盤價 || item.close || item.lastPrice || '') || null
  const getName = (item) =>
    (item.Name || item.CompanyName || item.股票名稱 || item.name || '').trim() || null
  const getCode = (item) =>
    (item.Code || item.SecuritiesCompanyCode || item.股票代號 || item.code || '').trim()

  // 1. 上市一般股
  const s = twData.stock.find(i => getCode(i) === code)
  if (s) { const p = getPrice(s); if (p) return { symbol: sym, price: p, name: getName(s), currency: 'TWD' } }

  // 2. 上市 ETF（0056, 00878 等）
  const e = twData.etf.find(i => getCode(i) === code)
  if (e) { const p = getPrice(e); if (p) return { symbol: sym, price: p, name: getName(e), currency: 'TWD' } }

  // 3. 上櫃一般股
  const o = twData.otc.find(i => getCode(i) === code)
  if (o) { const p = getPrice(o); if (p) return { symbol: sym, price: p, name: getName(o), currency: 'TWD' } }

  // 4. 上櫃 ETF
  const oe = twData.otcEtf.find(i => getCode(i) === code)
  if (oe) { const p = getPrice(oe); if (p) return { symbol: sym, price: p, name: getName(oe), currency: 'TWD' } }

  // 5. Fallback：TWSE 個股月報
  try {
    const today = new Date()
    const yyyymm = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}01`
    const r = await fetch(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}&stockNo=${code}`,
      { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (r.ok) {
      const data = await r.json()
      const rows = data?.data
      if (rows?.length) {
        const last = rows[rows.length - 1]
        const price = parseFloat(last[6]?.replace(/,/g, '')) || null
        const name  = data.title?.split(' ')?.[1]?.trim() || null
        if (price) return { symbol: sym, price, name, currency: 'TWD' }
      }
    }
  } catch {}

  return empty
}

// ── 美股/日股：Finnhub ────────────────────────────────────
async function fetchFinnhub(sym) {
  const empty = { symbol: sym, price: null, name: null, currency: sym.endsWith('.T') ? 'JPY' : 'USD' }
  try {
    const [quoteRes, profileRes] = await Promise.allSettled([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`,
        { signal: AbortSignal.timeout(6000) }),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`,
        { signal: AbortSignal.timeout(6000) }),
    ])
    let price = null, name = null
    if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
      const q = await quoteRes.value.json()
      price = q.c > 0 ? q.c : null
    }
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const p = await profileRes.value.json()
      name = p.name || null
    }
    if (price || name) return { ...empty, price, name }
  } catch {}
  return empty
}
