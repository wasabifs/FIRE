/**
 * api/fund-nav.js — 台灣基金淨值查詢 + 關鍵字搜尋
 *
 * GET /api/fund-nav?codes=T3703Y          → 查淨值
 * GET /api/fund-nav?search=國泰中小        → 搜尋基金列表
 *
 * 資料來源：鉅亨網 fund.api.cnyes.com
 */

const ANUE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://fund.cnyes.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9',
}

// ── 鉅亨搜尋，回傳包含淨值的完整資料 ────────────────────────
async function searchCnyes(keyword, limit = 10) {
  const url = `https://fund.api.cnyes.com/fund/api/v2/search?search=${encodeURIComponent(keyword)}&limit=${limit}`
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: ANUE_HEADERS })
  if (!r.ok) throw new Error(`cnyes search HTTP ${r.status}`)
  const data = await r.json()

  // 嘗試各種可能的結構
  const items = data?.data?.items
    || data?.data?.list
    || data?.items
    || data?.list
    || (Array.isArray(data?.data) ? data.data : null)
    || []

  return items.map(i => {
    // 淨值可能在不同欄位
    const price = parseFloat(
      i.nav || i.price || i.NAV || i.netAssetValue ||
      i.lastPrice || i.closePrice || i.close || 0
    ) || null

    const date = i.navDate || i.date || i.tradingDate || null

    return {
      code:    (i.fundCode || i.code || i.FundCode || '').trim(),
      name:    (i.fundName || i.name || i.FundName || '').trim(),
      company: (i.companyCh || i.company || i.Company || '').trim(),
      anueId:  String(i.cnyesCode || i.fundId || i.anueId || i.id || ''),
      price,
      date,
    }
  }).filter(i => i.code)
}

// ── 用 anueId 查個別基金詳細淨值 ────────────────────────────
async function getNavByAnueId(anueId) {
  // 嘗試多個可能的端點格式
  const endpoints = [
    `https://fund.api.cnyes.com/fund/api/v2/funds/${anueId}/nav?format=json`,
    `https://fund.api.cnyes.com/fund/api/v2/funds/${anueId}/nav`,
    `https://fund.api.cnyes.com/fund/api/v1/funds/${anueId}/nav`,
  ]

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: ANUE_HEADERS })
      if (!r.ok) continue

      const data = await r.json()

      // 嘗試各種 response 結構
      const candidates = [
        data?.data?.[0],
        Array.isArray(data?.data) ? data.data[0] : data?.data,
        data?.result?.[0],
        data?.[0],
        data,
      ].filter(Boolean)

      for (const c of candidates) {
        const price = parseFloat(c?.nav || c?.price || c?.NAV || c?.netAssetValue || 0)
        if (price > 0) {
          return { price, date: c?.date || c?.navDate || null }
        }
      }
    } catch { continue }
  }
  return null
}

// ── 主 handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { codes, search } = req.query

  // ── 搜尋模式 ──
  if (search) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    try {
      const results = await searchCnyes(search.trim())
      // 搜尋結果只回傳基本資料（不含淨值，避免洩漏）
      return res.status(200).json({
        funds: results.map(({ code, name, company }) => ({ code, name, company }))
      })
    } catch (e) {
      console.error('[fund-nav] search error:', e.message)
      return res.status(200).json({ funds: [], error: e.message })
    }
  }

  // ── 淨值查詢模式 ──
  if (!codes) return res.status(400).json({ error: 'codes or search required' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')

  const codeList = codes.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.all(codeList.map(async code => {
    const empty = { code, name: null, price: null, date: null, source: null }
    try {
      // 搜尋找到 anueId 和可能附帶的淨值
      const hits = await searchCnyes(code, 5)
      const match = hits.find(h => h.code.toUpperCase() === code.toUpperCase()) || hits[0]
      if (!match) return empty

      // 如果搜尋結果已包含淨值，直接用
      if (match.price) {
        console.log(`[fund-nav] ${code} price from search: ${match.price}`)
        return { code, name: match.name, price: match.price, date: match.date, source: 'cnyes-search' }
      }

      // 否則用 anueId 再查一次
      if (match.anueId) {
        const nav = await getNavByAnueId(match.anueId)
        if (nav?.price) {
          console.log(`[fund-nav] ${code} price from nav API: ${nav.price}, anueId: ${match.anueId}`)
          return { code, name: match.name, ...nav, source: 'cnyes-nav' }
        }
        console.warn(`[fund-nav] ${code} anueId=${match.anueId} nav API returned no price`)
      }
    } catch (e) {
      console.error(`[fund-nav] ${code} error:`, e.message)
    }
    return empty
  }))

  // 把實際的 API response 也 log 出來方便 debug
  console.log('[fund-nav] results:', JSON.stringify(results))
  return res.status(200).json({ funds: results })
}
