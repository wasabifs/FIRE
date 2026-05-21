// api/quote.js — Vercel Serverless Function
// 放在專案根目錄的 api/ 資料夾
// 前端呼叫：GET /api/quote?symbols=0050.TW,AAPL,7203.T

import yahooFinance from 'yahoo-finance2'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { symbols } = req.query
  if (!symbols) {
    return res.status(400).json({ error: 'symbols query param required' })
  }

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (symbolList.length === 0) {
    return res.status(400).json({ error: 'no valid symbols' })
  }

  try {
    const results = await Promise.allSettled(
      symbolList.map(sym =>
        yahooFinance.quote(sym, {
          fields: ['regularMarketPrice', 'shortName', 'longName', 'currency', 'regularMarketChangePercent'],
        })
      )
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
