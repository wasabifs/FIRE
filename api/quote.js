// api/quote.js — Vercel Serverless Function
// 用 Yahoo Finance v8 JSON endpoint，server 端無 CORS，不需要任何 npm 套件

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
    // Yahoo Finance v8 quote endpoint — server 端可直接呼叫
    const joined = symbolList.join(',')
    const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(joined)}&fields=regularMarketPrice,shortName,longName,currency`

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      }
    })

    if (!resp.ok) {
      // fallback: query2
      const url2 = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(joined)}`
      const resp2 = await fetch(url2, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      })
      if (!resp2.ok) throw new Error(`Yahoo HTTP ${resp2.status}`)
      const data2 = await resp2.json()
      return res.status(200).json({ quotes: buildQuotes(symbolList, data2?.quoteResponse?.result || []) })
    }

    const data = await resp.json()
    const results = data?.quoteResponse?.result || []
    return res.status(200).json({ quotes: buildQuotes(symbolList, results) })

  } catch (err) {
    console.error('quote handler error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

function buildQuotes(symbolList, results) {
  return symbolList.map(sym => {
    const r = results.find(q => q.symbol === sym)
    if (r) {
      return {
        symbol: sym,
        price: r.regularMarketPrice ?? null,
        name: r.shortName || r.longName || null,
        currency: r.currency || null,
      }
    }
    return { symbol: sym, price: null, name: null, currency: null }
  })
}
