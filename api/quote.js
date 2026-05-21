// api/quote.js — Vercel Serverless Function
// 負責：現價 + 標的名稱查詢（台股名稱用 TWSE OpenAPI，server 端無 CORS 問題）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols required' })

  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean)
  if (!symbolList.length) return res.status(400).json({ error: 'no symbols' })

  try {
    const { default: YahooFinance } = await import('yahoo-finance2')
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

    // 取得 Yahoo Finance 報價
    const results = await Promise.allSettled(
      symbolList.map(sym => yf.quote(sym))
    )

    // 台股代號對照（從 symbol 判斷是否為台股）
    const twNames = {}
    const twSymbols = symbolList.filter(s => s.endsWith('.TW'))
    if (twSymbols.length > 0) {
      try {
        // server 端直接打 TWSE，無 CORS 問題
        const r = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        if (r.ok) {
          const list = await r.json()
          for (const sym of twSymbols) {
            const code = sym.replace('.TW', '')
            const found = list.find(item => (item['公司代號'] || '').trim() === code)
            if (found) twNames[sym] = (found['公司簡稱'] || '').trim()
          }
        }
      } catch (e) {
        console.warn('TWSE server fetch error:', e.message)
        // TWSE 失敗也沒關係，fallback 用 Yahoo 的名稱
      }

      // TWSE 找不到的（ETF 等），試 TPEx
      const missing = twSymbols.filter(s => !twNames[s])
      if (missing.length > 0) {
        try {
          const r2 = await fetch('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', {
            signal: AbortSignal.timeout(6000),
            headers: { 'User-Agent': 'Mozilla/5.0' }
          })
          if (r2.ok) {
            const list2 = await r2.json()
            for (const sym of missing) {
              const code = sym.replace('.TW', '')
              const found = list2.find(item => (item['公司代號'] || '').trim() === code)
              if (found) twNames[sym] = (found['公司簡稱'] || '').trim()
            }
          }
        } catch (e) {
          console.warn('TPEx server fetch error:', e.message)
        }
      }
    }

    const quotes = results.map((r, i) => {
      const sym = symbolList[i]
      const twName = twNames[sym] || null

      if (r.status === 'fulfilled' && r.value) {
        const q = r.value
        return {
          symbol: sym,
          price: q.regularMarketPrice ?? null,
          // 台股優先用 TWSE 中文名，其次 Yahoo shortName
          name: twName || q.shortName || q.longName || null,
          currency: q.currency || null,
        }
      }

      console.error(`quote error [${sym}]:`, r.reason?.message)
      return { symbol: sym, price: null, name: twName, currency: null }
    })

    return res.status(200).json({ quotes })
  } catch (err) {
    console.error('handler error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
