// 匯率快取
const cache = {}
const CACHE_TTL = 60 * 60 * 1000 // 1小時

/**
 * 取得 from → TWD 的匯率
 * 走 /api/quote?rates= serverless，避免 frankfurter CORS 問題
 */
export async function getRate(from) {
  if (from === 'TWD') return 1
  if (cache[from] && Date.now() - cache[from].ts < CACHE_TTL) return cache[from].rate

  try {
    const res = await fetch(`/api/quote?rates=${from}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const rate = data.rates?.[from]
    if (rate) { cache[from] = { rate, ts: Date.now() }; return rate }
  } catch (e) {
    console.warn('getRate failed:', e.message)
  }

  const fallback = { USD: 32.5, JPY: 0.22, EUR: 35.5 }
  return fallback[from] || 1
}

/**
 * 批次取得多個幣別的 TWD 匯率
 */
export async function getRates(currencies) {
  const unique = [...new Set(currencies)].filter(c => c !== 'TWD')
  if (unique.length === 0) return { TWD: 1 }

  try {
    const res = await fetch(`/api/quote?rates=${unique.join(',')}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.rates) {
      // 更新快取
      for (const [k, v] of Object.entries(data.rates)) {
        if (k !== 'TWD' && v) cache[k] = { rate: v, ts: Date.now() }
      }
      return data.rates
    }
  } catch (e) {
    console.warn('getRates failed:', e.message)
  }

  const fallback = { TWD: 1, USD: 32.5, JPY: 0.22, EUR: 35.5 }
  const result = { TWD: 1 }
  for (const c of unique) result[c] = fallback[c] || 1
  return result
}
