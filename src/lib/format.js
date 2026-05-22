export function formatNTD(value, compact = false) {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (compact && Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (compact && Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// 專用於顯示股價/均價，保留小數點後兩位
export function formatPrice(value) {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  return num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPct(value) {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  const sign = num >= 0 ? '+' : ''
  return `${sign}${num.toFixed(2)}%`
}

export function formatPctColor(value) {
  const num = Number(value)
  if (num > 0) return 'var(--profit)'
  if (num < 0) return 'var(--loss)'
  return 'var(--text-muted)'
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

export function calcPnlPct(currentPrice, avgCost, quantity) {
  if (!avgCost || !currentPrice || !quantity) return 0
  const cost = avgCost * quantity
  const market = currentPrice * quantity
  return ((market - cost) / cost) * 100
}

export function calcUnrealizedPnl(currentPrice, avgCost, quantity) {
  if (!avgCost || !currentPrice || !quantity) return 0
  return (currentPrice - avgCost) * quantity
}
