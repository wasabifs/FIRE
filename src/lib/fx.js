// 匯率快取（session 內有效，不重複打 API）
const cache = {}

/**
 * 取得 from → TWD 的匯率
 * 使用 frankfurter.app（歐洲央行資料，免費無需 key）
 */
export async function getRate(from) {
  if (from === 'TWD') return 1
  const key = from
  if (cache[key]) return cache[key]

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=TWD`)
    const data = await res.json()
    const rate = data?.rates?.TWD
    if (rate) { cache[key] = rate; return rate }
  } catch (e) {
    console.warn('FX fetch failed:', e)
  }

  // fallback 預設值
  const fallback = { USD: 31.5, JPY: 0.21 }
  return fallback[from] || 1
}

/**
 * 批次取得多個幣別的 TWD 匯率
 * 回傳 { USD: 31.5, JPY: 0.21, TWD: 1, ... }
 */
export async function getRates(currencies) {
  const unique = [...new Set(currencies)].filter(c => c !== 'TWD')
  const rates = { TWD: 1 }
  await Promise.all(unique.map(async c => {
    rates[c] = await getRate(c)
  }))
  return rates
}
