// api/quote.js — Vercel Serverless Function
// 台股：TWSE OpenAPI 昨日收盤（穩定，server 端無 CORS）
// 美股：Finnhub
// 匯率：open.er-api.com

const FINNHUB_KEY = 'd877iipr01ql0hskkbqgd877iipr01ql0hskkbr0'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── 匯率模式：/api/quote?rates=USD,JPY ──
  const { symbols, rates } = req.query

  if (rates) {
    const currencies = rates.split(',').map(s => s.trim()).filter(Boolean)
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/TWD', {
        signal: AbortSignal.timeout(6000)
      })
      if (!r.ok) throw new Error(`er-api HTTP ${r.status}`)
      const data = await r.json()
      // TWD 為基準，取 1/rate 換成「1外幣=多少TWD」
      const result = { TWD: 1 }
      for (const c of currencies) {
        if (c === 'TWD') continue
        const rateToTWD = data.rates?.[c]
        // open.er-api 是 TWD 為基準，所以 rates.USD 是「1 TWD = ? USD」
        // 反過來就是「1 USD = ? TWD」
        result[c] = rateToTWD ? +(1 / rateToTWD).toFixed(4) : null
      }
      return res.status(200).json({ rates: result })
    } catch (e) {
      // fallback
      return res.status(200).json({ rates: { TWD: 1, USD: 32.5, JPY: 0.22 } })
    }
  }

  // ── 報價模式：/api/quote?symbols=0050.TW,AAPL ──
  if (!symbols) return res.status(400).json({ error: 'symbols or rates required' })
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (!symbolList.length) return res.status(400).json({ error: 'no symbols' })

  const quotes = await Promise.all(symbolList.map(sym => fetchOne(sym)))
  return res.status(200).json({ quotes })
}

async function fetchOne(sym) {
  if (sym.endsWith('.TW')) return fetchTWSE(sym)
  return fetchFinnhub(sym)
}

// ── 台股：TWSE OpenAPI（server 端可存取）────────────────────
async function fetchTWSE(sym) {
  const code = sym.replace('.TW', '')
  const empty = { symbol: sym, price: null, name: null, currency: 'TWD' }

  // 上市股票 + ETF
  const endpoints = [
    `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`,
    `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes`,
  ]

  // 1. TWSE 上市
  try {
    const r = await fetch(endpoints[0], {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (r.ok) {
      const list = await r.json()
      const found = list.find(item => (item.Code || item.股票代號 || '').trim() === code)
      if (found) {
        const price = parseFloat(found.ClosingPrice || found.收盤價 || found.close) || null
        const name  = (found.Name || found.股票名稱 || '').trim() || null
        if (price) return { symbol: sym, price, name, currency: 'TWD' }
      }
    }
  } catch (e) { console.warn('TWSE STOCK_DAY_ALL error:', e.message) }

  // 2. TPEx 上櫃
  try {
    const r = await fetch(endpoints[1], {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (r.ok) {
      const list = await r.json()
      const found = list.find(item => (item.SecuritiesCompanyCode || item.代號 || '').trim() === code)
      if (found) {
        const price = parseFloat(found.Close || found.收盤 || found.close) || null
        const name  = (found.CompanyName || found.名稱 || '').trim() || null
        if (price) return { symbol: sym, price, name, currency: 'TWD' }
      }
    }
  } catch (e) { console.warn('TPEx quotes error:', e.message) }

  // 3. TWSE 個股 API（精確查單一股）
  try {
    const today = new Date()
    const yyyymm = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}01`
    const r = await fetch(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}&stockNo=${code}`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (r.ok) {
      const data = await r.json()
      const rows = data?.data
      if (rows?.length) {
        const last = rows[rows.length - 1]
        const price = parseFloat(last[6]?.replace(/,/g, '')) || null  // 收盤價
        if (price) return { symbol: sym, price, name: data.title?.split(' ')[1] || null, currency: 'TWD' }
      }
    }
  } catch (e) { console.warn('TWSE STOCK_DAY error:', e.message) }

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
  } catch (e) { console.warn(`Finnhub error [${sym}]:`, e.message) }
  return empty
}
