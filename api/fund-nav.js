/**
 * api/fund-nav.js — 台灣基金淨值查詢
 * GET /api/fund-nav?codes=T3703Y,T3201Y
 *
 * 策略：抓 Yahoo 台灣股市基金頁面的 __NEXT_DATA__ JSON
 * URL: https://tw.stock.yahoo.com/fund/summary/F0HKG05WWH:FO
 */

const CODE_TO_SECID = {
  'T3703Y': 'F0HKG05WWH',
  'T3707Y': 'F0HKG05WWI',
  'T3201Y': 'F0HKG05X20',
  'T3207Y': 'F0HKG05WXW',
  'T3604Y': 'F0HKG05X22',
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchYahooTWFund(secId) {
  const symbol = `${secId}:FO`
  const url = `https://tw.stock.yahoo.com/fund/summary/${encodeURIComponent(symbol)}`

  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9',
      'Cache-Control': 'no-cache',
    },
  })

  console.log(`[fund-nav] Yahoo TW ${symbol} HTTP ${r.status}`)
  if (!r.ok) throw new Error(`Yahoo TW HTTP ${r.status}`)

  const html = await r.text()

  // 從 __NEXT_DATA__ 取資料
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1])
      // 深入找基金淨值
      const str = JSON.stringify(nextData)

      // 找 ClosePrice 或 regularMarketPrice
      const priceMatch = str.match(/"ClosePrice"\s*:\s*([0-9.]+)/) ||
                         str.match(/"closePrice"\s*:\s*([0-9.]+)/) ||
                         str.match(/"regularMarketPrice"\s*:\s*([0-9.]+)/) ||
                         str.match(/"nav"\s*:\s*([0-9.]+)/)

      const dateMatch = str.match(/"ClosePriceDate"\s*:\s*"([^"]+)"/) ||
                        str.match(/"closePriceDate"\s*:\s*"([^"]+)"/)

      const nameMatch = str.match(/"LegalName"\s*:\s*"([^"]+)"/) ||
                        str.match(/"legalName"\s*:\s*"([^"]+)"/) ||
                        str.match(/"longName"\s*:\s*"([^"]+)"/)

      const price = priceMatch ? parseFloat(priceMatch[1]) : null
      const date  = dateMatch ? dateMatch[1] : null
      const name  = nameMatch ? nameMatch[1] : null

      console.log(`[fund-nav] NEXT_DATA ${symbol}: price=${price}, name=${name}`)
      if (price) return { price, date, name }
    } catch (e) {
      console.error('[fund-nav] NEXT_DATA parse error:', e.message)
    }
  }

  // fallback: 直接從 HTML 抓淨值數字
  // Yahoo TW 基金頁顯示格式: "193.17新台幣" 或 class 含淨值的 span
  const patterns = [
    /(\d{2,4}\.\d{2})\s*新台幣/,
    /"price"\s*:\s*([0-9.]+)/,
    /class="[^"]*price[^"]*"[^>]*>([0-9.]+)/i,
    /淨值[^0-9]*([0-9]{2,4}\.[0-9]{2})/,
  ]

  for (const p of patterns) {
    const m = html.match(p)
    if (m) {
      const price = parseFloat(m[1])
      if (price > 1 && price < 100000) {
        console.log(`[fund-nav] HTML pattern ${symbol}: price=${price}`)
        return { price, date: null, name: null }
      }
    }
  }

  // log 前 1000 字 HTML 幫助 debug
  console.log(`[fund-nav] ${symbol} HTML snippet:`, html.substring(0, 1000))
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  if (search) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ funds: [] })
  }

  if (!codes) return res.status(400).json({ error: 'codes required' })
  res.setHeader('Cache-Control', 'no-store')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    const secId = CODE_TO_SECID[code.toUpperCase()]
    if (!secId) return empty

    try {
      const nav = await fetchYahooTWFund(secId)
      if (nav?.price) return { code, ...nav, source: 'yahoo-tw' }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  return res.status(200).json({ funds: results })
}
