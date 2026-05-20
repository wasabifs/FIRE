import { useState, useEffect } from 'react'
import { RefreshCw, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD, formatPct, formatPctColor } from '../lib/format'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const MARKET_COLORS = {
  TW: '#3b82f6',
  US: '#8b5cf6',
  JP: '#f59e0b',
  CRYPTO: '#10b981',
  FUND: '#ec4899',
  CASH: '#4d5a6e',
}

const MARKET_LABELS = { TW: '台股', US: '美股', JP: '日股', CRYPTO: '加密幣', FUND: '基金', CASH: '現金' }

export default function Overview() {
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    totalAssets: 0,
    totalInvestment: 0,
    totalCash: 0,
    unrealizedPnl: 0,
    unrealizedPct: 0,
    marketBreakdown: [],
    goal: null,
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [{ data: accounts }, { data: goals }] = await Promise.all([
        supabase.from('accounts').select('*, holdings(*)').eq('user_id', user.id).eq('is_active', true),
        supabase.from('goals').select('*').eq('user_id', user.id).limit(1).single(),
      ])

      let totalInvestment = 0, totalCash = 0, totalCost = 0
      const marketMap = {}

      for (const acc of accounts || []) {
        for (const h of acc.holdings || []) {
          if (h.asset_type === 'cash') {
            totalCash += Number(h.quantity)
            marketMap['CASH'] = (marketMap['CASH'] || 0) + Number(h.quantity)
          } else {
            const market = Number(h.current_price) * Number(h.quantity)
            const cost = Number(h.avg_cost) * Number(h.quantity)
            totalInvestment += market
            totalCost += cost
            marketMap[h.market] = (marketMap[h.market] || 0) + market
          }
        }
      }

      const totalAssets = totalInvestment + totalCash
      const unrealizedPnl = totalInvestment - totalCost
      const unrealizedPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0

      const marketBreakdown = Object.entries(marketMap).map(([market, value]) => ({
        market, value,
        pct: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
      })).sort((a, b) => b.value - a.value)

      setData({ totalAssets, totalInvestment, totalCash, unrealizedPnl, unrealizedPct, marketBreakdown, goal: goals })
    } finally {
      setLoading(false)
    }
  }

  const mask = (v) => hidden ? '●●●●●●' : v
  const goalPct = data.goal ? Math.min((data.totalAssets / data.goal.target_amount) * 100, 100) : null

  return (
    <div className="page fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p className="label">總資產</p>
          {loading
            ? <div className="skeleton" style={{ width: 160, height: 34, marginTop: 4 }} />
            : <div className="big-number">{mask(`NT$ ${formatNTD(data.totalAssets)}`)}</div>
          }
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-icon btn" onClick={() => setHidden(h => !h)}>
            {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button className="btn-icon btn" onClick={loadData}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Goal progress */}
      {goalPct !== null && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="label">{data.goal.name}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-blue)' }}>
              {goalPct.toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${goalPct}%`,
              background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))',
              borderRadius: 3,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              NT$ {formatNTD(data.totalAssets, true)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              目標 NT$ {formatNTD(data.goal.target_amount, true)}
            </span>
          </div>
        </div>
      )}

      {/* Investment + Cash row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>投資市值</p>
          <div className="medium-number">{mask(formatNTD(data.totalInvestment))}</div>
          <div style={{ fontSize: 12, color: formatPctColor(data.unrealizedPct), marginTop: 2 }}>
            {mask(formatPct(data.unrealizedPct))}
          </div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>現金</p>
          <div className="medium-number">{mask(formatNTD(data.totalCash))}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            未實現 {mask(formatNTD(data.unrealizedPnl))}
          </div>
        </div>
      </div>

      {/* Pie chart */}
      {data.marketBreakdown.length > 0 && (
        <div className="card">
          <p className="label" style={{ marginBottom: 12 }}>資產佔比</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={data.marketBreakdown} dataKey="value" cx="50%" cy="50%"
                  innerRadius={32} outerRadius={55} paddingAngle={2} strokeWidth={0}>
                  {data.marketBreakdown.map(({ market }) => (
                    <Cell key={market} fill={MARKET_COLORS[market] || '#4d5a6e'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `NT$ ${formatNTD(v)}`} contentStyle={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12,
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.marketBreakdown.map(({ market, value, pct }) => (
                <div key={market} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: MARKET_COLORS[market] || '#4d5a6e', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                    {MARKET_LABELS[market] || market}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data.totalAssets === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 14 }}>尚無資產資料</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>先到「資產」頁面新增帳戶</p>
        </div>
      )}
    </div>
  )
}
