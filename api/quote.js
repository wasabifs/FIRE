// api/quote.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)

  try {
    // 用 require 方式避免 ESM default export 問題
    const yf = await import('yahoo-finance2')
    const yahooFinance = yf.default ?? yf

    const results = await Promise.allSettled(
      symbolList.map(sym => yahooFinance.quote(sym))
    )

    const quotes = results.map((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        const q = r.value
        return {
          symbol: symbolList[i],
          price: q.regularMarketPrice ?? null,
          name: q.shortName || q.longName || null,
          currency: q.currency || null,
          changePercent: q.regularMarketChangePercent ?? null,
        }
      }
      return { symbol: symbolList[i], price: null, name: null, currency: null, changePercent: null }
    })

    return res.status(200).json({ quotes })
  } catch (err) {
    console.error('yahoo-finance2 error:', err)
    return res.status(500).json({ error: err.message })
  }
}
