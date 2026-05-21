// api/quote.js — Vercel Serverless Function
// 使用 Finnhub API（免費、穩定、不封鎖雲端 IP）

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

  // Finnhub 台股格式：0050.TW → TWSE:0050
  // 美股：AAPL → AAPL
  // 日股：7203.T → TYO:7203
  function toFinnhubSymbol(sym) {
    if (sym.endsWith('.TW')) return `TWSE:${sym.replace('.TW', '')}`
    if (sym.endsWith('.T'))  return `TYO:${sym.replace('.T', '')}`
    return sym
  }

  try {
    const results = await Promise.allSettled(
      symbolList.map(async (sym) => {
        const fSym = toFinnhubSymbol(sym)

        // 同時取報價 + 公司名稱
        const [quoteRes, profileRes] = await Promise.allSettled([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fSym)}&token=${FINNHUB_KEY}`,
            { signal: AbortSignal.timeout(6000) }),
          fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(fSym)}&token=${FINNHUB_KEY}`,
            { signal: AbortSignal.timeout(6000) }),
        ])

        let price = null
        let name = null

        if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
          const q = await quoteRes.value.json()
          price = q.c || null  // c = current price
        }

        if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
          const p = await profileRes.value.json()
          name = p.name || null
        }

        return { symbol: sym, price, name, currency: sym.endsWith('.TW') ? 'TWD' : sym.endsWith('.T') ? 'JPY' : 'USD' }
      })
    )

    const quotes = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      console.error(`finnhub error [${symbolList[i]}]:`, r.reason?.message)
      return { symbol: symbolList[i], price: null, name: null, currency: null }
    })

    return res.status(200).json({ quotes })
  } catch (err) {
    console.error('handler error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
