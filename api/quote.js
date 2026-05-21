// api/quote.js — Vercel Serverless Function
// 台股：TWSE 即時行情 API（官方免費）
// 美股/日股：Finnhub（免費）

const FINNHUB_KEY = 'd877iipr01ql0hskkbqgd877iipr01ql0hskkbr0'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols required' })

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (!symbolList.length) return res.status(400).json({ error: 'no symbols' })

  const quotes = await Promise.all(symbolList.map(sym => fetchOne(sym)))
  return res.status(200).json({ quotes })
}

async function fetchOne(sym) {
  // 台股（.TW）→ TWSE 即時行情
  if (sym.endsWith('.TW')) {
    return fetchTWSE(sym)
  }
  // 日股（.T）或美股 → Finnhub
  return fetchFinnhub(sym)
}

// ── 台股：TWSE 即時行情 ───────────────────────────────────
async function fetchTWSE(sym) {
  const code = sym.replace('.TW', '')
  const empty = { symbol: sym, price: null, name: null, currency: 'TWD' }

  // 先試上市（tse），再試上櫃（otc）
  for (const prefix of ['tse', 'otc']) {
    try {
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${code}.tw&json=1&delay=0`
      const r = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' }
      })
      if (!r.ok) continue
      const data = await r.json()
      const item = data?.msgArray?.[0]
      if (!item || !item.z || item.z === '-') continue

      const price = parseFloat(item.z)  // z = 最新成交價
      const name  = item.n || null       // n = 股票名稱

      if (!isNaN(price) && price > 0) {
        return { symbol: sym, price, name, currency: 'TWD' }
      }
    } catch (e) {
      console.warn(`TWSE ${prefix} error [${code}]:`, e.message)
    }
  }

  // 盤後或休市：改用 TWSE 昨日收盤
  try {
    const url = `https://query.twse.com.tw/server-2/userCode?StockNo=${code}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (r.ok) {
      const data = await r.json()
      const item = data?.[0]
      if (item) {
        return {
          symbol: sym,
          price: parseFloat(item.d || item.ClosePrice) || null,
          name: item.n || item.Name || null,
          currency: 'TWD'
        }
      }
    }
  } catch {}

  return empty
}

// ── 美股/日股：Finnhub ────────────────────────────────────
async function fetchFinnhub(sym) {
  // 日股格式轉換
  const fSym = sym.endsWith('.T') ? sym.replace('.T', '') + '.T' : sym
  const empty = { symbol: sym, price: null, name: null, currency: sym.endsWith('.T') ? 'JPY' : 'USD' }

  try {
    const [quoteRes, profileRes] = await Promise.allSettled([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fSym)}&token=${FINNHUB_KEY}`,
        { signal: AbortSignal.timeout(6000) }),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(fSym)}&token=${FINNHUB_KEY}`,
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

    if (price || name) return { symbol: sym, price, name, currency: empty.currency }
  } catch (e) {
    console.warn(`Finnhub error [${fSym}]:`, e.message)
  }

  return empty
}
