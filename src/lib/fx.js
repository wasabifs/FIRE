// 匯率快取（session 內有效，不重複打 API）
const cache = {}

/**
 * 取得 from → TWD 的匯率
 * 注意：Frankfurter.app 使用歐洲央行資料，TWD 不在支援清單中。
 * 正確做法：查 from→USD 再乘以 USD→TWD 固定估算，
 * 或直接查 from→USD 後用台灣央行近似匯率換算。
 *
 * 更可靠的方式：查詢 USD→from 反推，取倒數。
 * 例如查 USD/TWD = 31.x 需用其他來源；
 * 這裡改用 exchangerate-api.com 的 open endpoint 取得 TWD 匯率。
 */
export async function getRate(from) {
  if (from === 'TWD') return 1
  const key = from
  if (cache[key]) return cache[key]

  // 方法1: 用 Frankfurter 查 from 對 USD，再乘以 USD/TWD
  try {
    // 先取 USD→TWD（從 TWD 的角度查）
    const [resFromUSD, resUSDTWD] = await Promise.all([
      fetch(`https://api.frankfurter.app/latest?from=${from}&to=USD`, { signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.frankfurter.app/latest?from=USD&to=JPY`, { signal: AbortSignal.timeout(5000) }),
    ])

    // 使用 open.er-api.com 取得 USD→TWD（免費，不需 key）
    const erRes = await fetch(`https://open.er-api.com/v6/latest/USD`, { signal: AbortSignal.timeout(6000) })
    const erData = await erRes.json()
    const usdToTWD = erData?.rates?.TWD

    if (usdToTWD) {
      // 取得 from→USD
      const fromRes = await fetch(`https://open.er-api.com/v6/latest/${from}`, { signal: AbortSignal.timeout(6000) })
      const fromData = await fromRes.json()
      const rate = fromData?.rates?.TWD
      if (rate) {
        cache[key] = rate
        return rate
      }
    }
  } catch (e) {
    console.warn('open.er-api fetch failed:', e)
  }

  // 方法2: fallback 用 Frankfurter 查 from→USD 再乘以固定 USD/TWD
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=USD`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    const fromToUSD = data?.rates?.USD
    if (fromToUSD) {
      // USD/TWD 近似值（會稍有偏差，但作為 fallback 可接受）
      const USD_TWD_APPROX = 32.5
      const rate = fromToUSD * USD_TWD_APPROX
      cache[key] = rate
      return rate
    }
  } catch (e) {
    console.warn('Frankfurter fallback failed:', e)
  }

  // 最終 fallback
  const fallback = { USD: 32.5, JPY: 0.22, EUR: 35.5, HKD: 4.2 }
  return fallback[from] || 1
}

/**
 * 批次取得多個幣別的 TWD 匯率
 * 回傳 { USD: 32.5, JPY: 0.22, TWD: 1, ... }
 */
export async function getRates(currencies) {
  const unique = [...new Set(currencies)].filter(c => c !== 'TWD')
  const rates = { TWD: 1 }
  await Promise.all(unique.map(async c => {
    rates[c] = await getRate(c)
  }))
  return rates
}
