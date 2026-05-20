import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatNTD, formatPct, formatPctColor } from '../lib/format'
import PageHeader from '../components/layout/PageHeader'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'

const PERIODS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '全部', days: 9999 },
]

const MARKET_COLORS = {
  TW: '#3b82f6', US: '#8b5cf6', JP: '#f59e0b',
  CRYPTO: '#10b981', FUND: '#ec4899', CASH: '#4d5a6e',
}
const MARKET_LABELS = { TW: '台股', US: '美股', JP: '日股', CRYPTO: '加密幣', FUND: '基金', CASH: '現金' }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, fontFamily: 'DM Mono', fontWeight: 500 }}>
          NT$ {formatNTD(p.value)}
        </p>
      ))}
    </div>
  )
}

function MarketReturnCard({ market, pct, amount }) {
  return (
    <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: MARKET_COLORS[market] || '#4d5a6e', flexShrink: 0,
      }} />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
        {MARKET_LABELS[market] || market}
      </span>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: formatPctColor(pct) }}>
          {formatPct(pct)}
        </p>
        <p style={{ fontSize: 11, color: formatPctColor(amount) }}>
          {amount >= 0 ? '+' : ''}{formatNTD(amount)}
        </p>
      </div>
    </div>
  )
}

export default function Trend() {
  const [period, setPeriod] = useState('3M')
  const [snapshots, setSnapshots] = useState([])
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const days = PERIODS.find(p => p.label === period)?.days || 90
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    const fromStr = days === 9999 ? '2000-01-01' : fromDate.toISOString().slice(0, 10)

    const [{ data: snaps }, { data: accounts }] = await Promise.all([
      supabase.from('snapshots').select('*')
        .eq('user_id', user.id)
        .gte('snapshot_date', fromStr)
        .order('snapshot_date'),
      supabase.from('accounts').select('*, holdings(*)')
        .eq('user_id', user.id).eq('is_active', true),
    ])

    setSnapshots(snaps || [])

    // collect all holdings for market breakdown
    const allHoldings = (accounts || []).flatMap(a =>
      (a.holdings || []).filter(h => h.asset_type !== 'cash')
    )
    setHoldings(allHoldings)
    setLoading(false)
  }

  // Save today's snapshot
  async function saveSnapshot() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: accounts } = await supabase
      .from('accounts').select('*, holdings(*)')
      .eq('user_id', user.id).eq('is_active', true)

    let totalInvestment = 0, totalCash = 0
    const marketMap = {}

    for (const acc of accounts || []) {
      for (const h of acc.holdings || []) {
        if (h.asset_type === 'cash') {
          totalCash += Number(h.quantity)
          marketMap['CASH'] = (marketMap['CASH'] || 0) + Number(h.quantity)
        } else {
          const val = Number(h.current_price) * Number(h.quantity)
          totalInvestment += val
          marketMap[h.market] = (marketMap[h.market] || 0) + val
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('snapshots').upsert({
      user_id: user.id,
      snapshot_date: today,
      total_assets: totalInvestment + totalCash,
      total_investment: totalInvestment,
      total_cash: totalCash,
      market_breakdown: marketMap,
    }, { onConflict: 'user_id,snapshot_date' })

    loadData()
  }

  // Chart data
  const chartData = snapshots.map(s => ({
    date: s.snapshot_date.slice(5),
    total: Math.round(s.total_assets),
    investment: Math.round(s.total_investment),
  }))

  // Market returns from current holdings
  const marketGroups = {}
  for (const h of holdings) {
    if (!marketGroups[h.market]) marketGroups[h.market] = { cost: 0, market: 0 }
    marketGroups[h.market].cost += Number(h.avg_cost) * Number(h.quantity)
    marketGroups[h.market].market += Number(h.current_price) * Number(h.quantity)
  }

  const marketReturns = Object.entries(marketGroups).map(([mkt, { cost, market }]) => ({
    market: mkt,
    pct: cost > 0 ? ((market - cost) / cost) * 100 : 0,
    amount: market - cost,
  })).sort((a, b) => b.amount - a.amount)

  // Overall stats
  const firstSnap = snapshots[0]
  const lastSnap = snapshots[snapshots.length - 1]
  const periodReturn = firstSnap && lastSnap
    ? ((lastSnap.total_assets - firstSnap.total_assets) / firstSnap.total_assets) * 100
    : 0
  const periodChange = firstSnap && lastSnap
    ? lastSnap.total_assets - firstSnap.total_assets : 0

  const totalCost = holdings.reduce((s, h) => s + Number(h.avg_cost) * Number(h.quantity), 0)
  const totalMarket = holdings.reduce((s, h) => s + Number(h.current_price) * Number(h.quantity), 0)
  const overallReturn = totalCost > 0 ? ((totalMarket - totalCost) / totalCost) * 100 : 0

  return (
    <div className="page fade-in">
      <PageHeader
        title="趨勢"
        action={
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={saveSnapshot}>
            記錄今日快照
          </button>
        }
      />

      {/* Period selector */}
      <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {PERIODS.map(({ label }) => (
          <button key={label} onClick={() => setPeriod(label)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: period === label ? 600 : 400,
            background: period === label ? 'var(--bg-card)' : 'transparent',
            color: period === label ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Period return summary */}
      {snapshots.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div className="card-sm">
            <p className="label" style={{ marginBottom: 4 }}>區間報酬</p>
            <div style={{ fontSize: 20, fontFamily: 'DM Mono', fontWeight: 500, color: formatPctColor(periodReturn) }}>
              {formatPct(periodReturn)}
            </div>
            <p style={{ fontSize: 11, color: formatPctColor(periodChange), marginTop: 2 }}>
              {periodChange >= 0 ? '+' : ''}{formatNTD(periodChange)}
            </p>
          </div>
          <div className="card-sm">
            <p className="label" style={{ marginBottom: 4 }}>歷史總報酬</p>
            <div style={{ fontSize: 20, fontFamily: 'DM Mono', fontWeight: 500, color: formatPctColor(overallReturn) }}>
              {formatPct(overallReturn)}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              +{formatNTD(totalMarket - totalCost)}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 8px 8px' }}>
        <p className="label" style={{ marginBottom: 12, paddingLeft: 8 }}>資產走勢</p>
        {loading ? (
          <div className="skeleton" style={{ height: 180, borderRadius: 8 }} />
        ) : chartData.length < 2 ? (
          <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, gap: 6 }}>
            <p>資料不足，無法顯示圖表</p>
            <p style={{ fontSize: 11 }}>點右上角「記錄今日快照」開始累積</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false} width={60}
                tickFormatter={v => `${(v/10000).toFixed(0)}萬`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2}
                dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Market returns */}
      {marketReturns.length > 0 && (
        <div>
          <p className="label" style={{ marginBottom: 10 }}>各市場報酬</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {marketReturns.map(({ market, pct, amount }) => (
              <MarketReturnCard key={market} market={market} pct={pct} amount={amount} />
            ))}
          </div>
        </div>
      )}

      {!loading && holdings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 14 }}>尚無投資資料</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>先到「資產」頁面新增持倉</p>
        </div>
      )}
    </div>
  )
}
