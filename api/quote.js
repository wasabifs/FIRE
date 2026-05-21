// api/quote.js — Vercel Serverless Function
// 使用 yahoo-finance2 v3+ 的正確寫法：import default 後 new 實例化

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (symbolList.length === 0) return res.status(400).json({ error: 'no valid symbols' })

  try {
    // v3+ 正確寫法：default export 是 class，需要 new
    const { default: YahooFinance } = await import('yahoo-finance2')
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

    const results = await Promise.allSettled(
      symbolList.map(sym => yf.quote(sym))
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
      console.error(`Failed ${symbolList[i]}:`, r.reason?.message)
      return { symbol: symbolList[i], price: null, name: null, currency: null, changePercent: null }
    })

    return res.status(200).json({ quotes })
  } catch (err) {
    console.error('handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}
