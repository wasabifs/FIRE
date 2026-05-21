// api/quote.js — Vercel Serverless Function
// 負責：現價查詢（台股 + 美股 + 日股）
// 台股名稱由前端直接打 TWSE OpenAPI，不走這裡

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols required' })

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (!symbolList.length) return res.status(400).json({ error: 'no symbols' })

  try {
    const { default: YahooFinance } = await import('yahoo-finance2')
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

    const results = await Promise.allSettled(
      symbolList.map(sym => yf.quote(sym))
    )

    const quotes = results.map((r, i) => {
      if (r.status === 'fulfilled' && r.value?.regularMarketPrice) {
        const q = r.value
        return {
          symbol: symbolList[i],
          price: q.regularMarketPrice,
          name: q.shortName || q.longName || null,
          currency: q.currency || null,
        }
      }
      if (r.status === 'rejected') {
        console.error(`quote error [${symbolList[i]}]:`, r.reason?.message)
      }
      return { symbol: symbolList[i], price: null, name: null, currency: null }
    })

    return res.status(200).json({ quotes })
  } catch (err) {
    console.error('handler error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
