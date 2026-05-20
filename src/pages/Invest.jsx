import { useState, useEffect } from 'react'
import { Plus, RefreshCw, X, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, DollarSign } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD, formatPct, formatPctColor, formatDate } from '../lib/format'
import PageHeader from '../components/layout/PageHeader'

const TABS = ['持倉', '交易', '損益']

const MARKETS = ['全部', 'TW', 'US', 'JP', 'CRYPTO', 'FUND']
const MARKET_LABELS = { TW: '台股', US: '美股', JP: '日股', CRYPTO: '加密', FUND: '基金', 全部: '全部' }

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active === t ? 600 : 400,
          background: active === t ? 'var(--bg-card)' : 'transparent',
          color: active === t ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'all 0.15s',
        }}>{t}</button>
      ))}
    </div>
  )
}

function AddTransactionModal({ accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_id: accounts[0]?.id || '',
    type: 'buy', symbol: '', market: 'TW',
    quantity: '', price: '', fee: '', tax: '',
    trade_date: new Date().toISOString().slice(0, 10), note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.symbol || !form.quantity || !form.price) return
    setSaving(true)
    const { error } = await supabase.from('transactions').insert({
      account_id: form.account_id,
      type: form.type,
      symbol: form.symbol.trim().toUpperCase(),
      market: form.market,
      quantity: Number(form.quantity),
      price: Number(form.price),
      fee: Number(form.fee) || 0,
      tax: Number(form.tax) || 0,
      trade_date: form.trade_date,
      note: form.note.trim() || null,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  const total = (Number(form.quantity) * Number(form.price)) + Number(form.fee || 0) + Number(form.tax || 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 430, background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', border: '1px solid var(--border)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>新增交易</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Buy / Sell toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 10, padding: 3 }}>
            {['buy', 'sell'].map(t => (
              <button key={t} onClick={() => set('type', t)} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
                background: form.type === t ? (t === 'buy' ? 'var(--profit)' : 'var(--loss)') : 'transparent',
                color: form.type === t ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>{t === 'buy' ? '買入' : '賣出'}</button>
            ))}
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>帳戶</p>
            <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>代號</p>
              <input className="input" placeholder="例：0050" value={form.symbol} onChange={e => set('symbol', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>市場</p>
              <select className="input" value={form.market} onChange={e => set('market', e.target.value)}>
                {['TW', 'US', 'JP', 'CRYPTO', 'FUND'].map(m => <option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>數量</p>
              <input className="input" type="number" placeholder="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>成交價</p>
              <input className="input" type="number" placeholder="0" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>手續費</p>
              <input className="input" type="number" placeholder="0" value={form.fee} onChange={e => set('fee', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>稅</p>
              <input className="input" type="number" placeholder="0" value={form.tax} onChange={e => set('tax', e.target.value)} />
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>交易日期</p>
            <input className="input" type="date" value={form.trade_date} onChange={e => set('trade_date', e.target.value)} />
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>備註（選填）</p>
            <input className="input" placeholder="交易原因或備注" value={form.note} onChange={e => set('note', e.target.value)} />
          </div>

          {total > 0 && (
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>總金額</span>
              <span className="text-mono" style={{ fontSize: 13, fontWeight: 500 }}>NT$ {formatNTD(total)}</span>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}
            onClick={save} disabled={saving || !form.symbol || !form.quantity || !form.price}>
            {saving ? '儲存中...' : '新增交易'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddPnlModal({ accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_id: accounts[0]?.id || '',
    type: 'dividend', symbol: '', market: 'TW',
    amount: '', tax: '',
    record_date: new Date().toISOString().slice(0, 10), note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const PNL_TYPES = [
    { value: 'dividend', label: '股利/配息' },
    { value: 'sell_profit', label: '賣出損益' },
    { value: 'interest', label: '利息' },
    { value: 'other', label: '其他' },
  ]

  async function save() {
    if (!form.amount) return
    setSaving(true)
    const { error } = await supabase.from('pnl_records').insert({
      account_id: form.account_id,
      type: form.type,
      symbol: form.symbol.trim().toUpperCase() || null,
      market: form.market || null,
      amount: Number(form.amount),
      tax: Number(form.tax) || 0,
      record_date: form.record_date,
      note: form.note.trim() || null,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 430, background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>新增損益紀錄</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p className="label" style={{ marginBottom: 6 }}>類型</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PNL_TYPES.map(({ value, label }) => (
                <button key={value} onClick={() => set('type', value)} style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                  background: form.type === value ? 'rgba(59,130,246,0.15)' : 'var(--bg-input)',
                  color: form.type === value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  border: form.type === value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>帳戶</p>
            <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>代號（選填）</p>
              <input className="input" placeholder="例：0050" value={form.symbol} onChange={e => set('symbol', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>市場</p>
              <select className="input" value={form.market} onChange={e => set('market', e.target.value)}>
                {['TW', 'US', 'JP', 'CRYPTO', 'FUND'].map(m => <option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>金額（TWD）</p>
              <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6 }}>稅（選填）</p>
              <input className="input" type="number" placeholder="0" value={form.tax} onChange={e => set('tax', e.target.value)} />
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>日期</p>
            <input className="input" type="date" value={form.record_date} onChange={e => set('record_date', e.target.value)} />
          </div>

          <div>
            <p className="label" style={{ marginBottom: 6 }}>備註（選填）</p>
            <input className="input" placeholder="" value={form.note} onChange={e => set('note', e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}
            onClick={save} disabled={saving || !form.amount}>
            {saving ? '儲存中...' : '新增紀錄'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HoldingsTab({ accounts }) {
  const [marketFilter, setMarketFilter] = useState('全部')

  const allHoldings = accounts.flatMap(acc =>
    (acc.holdings || [])
      .filter(h => h.asset_type !== 'cash')
      .map(h => ({ ...h, accountName: acc.name }))
  )
  const filtered = marketFilter === '全部' ? allHoldings : allHoldings.filter(h => h.market === marketFilter)

  const totalMarket = filtered.reduce((s, h) => s + Number(h.current_price) * Number(h.quantity), 0)
  const totalCost = filtered.reduce((s, h) => s + Number(h.avg_cost) * Number(h.quantity), 0)
  const totalPnl = totalMarket - totalCost
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>投資市值</p>
          <div className="medium-number">{formatNTD(totalMarket)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>未實現損益</p>
          <div className="medium-number" style={{ color: formatPctColor(totalPnl) }}>{formatNTD(totalPnl)}</div>
          <div style={{ fontSize: 12, color: formatPctColor(totalPct) }}>{formatPct(totalPct)}</div>
        </div>
      </div>

      {/* Market filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {MARKETS.map(m => (
          <button key={m} onClick={() => setMarketFilter(m)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            background: marketFilter === m ? 'var(--accent-blue)' : 'var(--bg-input)',
            color: marketFilter === m ? 'white' : 'var(--text-secondary)',
            border: marketFilter === m ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
            flexShrink: 0,
          }}>{MARKET_LABELS[m] || m}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          尚無持倉資料
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(h => {
            const market = Number(h.current_price) * Number(h.quantity)
            const cost = Number(h.avg_cost) * Number(h.quantity)
            const pnl = market - cost
            const pct = cost > 0 ? (pnl / cost) * 100 : 0
            return (
              <div key={h.id} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{h.symbol}</span>
                    <span className="badge badge-neutral" style={{ fontSize: 10 }}>{h.market}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.name} · {h.accountName}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {Number(h.quantity).toLocaleString()} 股 · 均 {formatNTD(h.avg_cost)}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="text-mono" style={{ fontSize: 14, fontWeight: 500 }}>
                    {formatNTD(market)}
                  </p>
                  <p style={{ fontSize: 12, color: formatPctColor(pct) }}>{formatPct(pct)}</p>
                  <p style={{ fontSize: 11, color: formatPctColor(pnl) }}>{pnl >= 0 ? '+' : ''}{formatNTD(pnl)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TransactionsTab({ accounts }) {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const accountIds = accounts.map(a => a.id)
    if (!accountIds.length) { setLoading(false); return }
    let q = supabase.from('transactions').select('*').in('account_id', accountIds).order('trade_date', { ascending: false })
    if (dateFrom) q = q.gte('trade_date', dateFrom)
    if (dateTo) q = q.lte('trade_date', dateTo)
    const { data } = await q
    setTxns(data || [])
    setLoading(false)
  }

  const totalBuy = txns.filter(t => t.type === 'buy').reduce((s, t) => s + Number(t.quantity) * Number(t.price) + Number(t.fee || 0), 0)
  const totalSell = txns.filter(t => t.type === 'sell').reduce((s, t) => s + Number(t.quantity) * Number(t.price) - Number(t.fee || 0) - Number(t.tax || 0), 0)
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]))

  function exportCSV() {
    const header = '日期,類型,代號,市場,數量,成交價,手續費,稅,帳戶,備註'
    const rows = txns.map(t => [
      t.trade_date, t.type === 'buy' ? '買入' : '賣出', t.symbol, t.market,
      t.quantity, t.price, t.fee || 0, t.tax || 0,
      accountMap[t.account_id] || '', t.note || ''
    ].join(','))
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `交易紀錄_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>買入總額</p>
          <div className="medium-number">{formatNTD(totalBuy)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>賣出總額</p>
          <div className="medium-number">{formatNTD(totalSell)}</div>
        </div>
      </div>

      {/* Date filter */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
        <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '8px' }} onClick={load}>篩選</button>
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '8px 12px' }} onClick={exportCSV}>匯出 CSV</button>
        <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : txns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>尚無交易紀錄</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {txns.map(t => (
            <div key={t.id} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: t.type === 'buy' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              }}>
                {t.type === 'buy' ? <ArrowUpRight size={16} color="var(--profit)" /> : <ArrowDownRight size={16} color="var(--loss)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.symbol}</span>
                  <span className={`badge ${t.type === 'buy' ? 'badge-profit' : 'badge-loss'}`}>{t.type === 'buy' ? '買入' : '賣出'}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(t.trade_date)} · {accountMap[t.account_id] || ''}</p>
                {t.note && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{t.note}</p>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="text-mono" style={{ fontSize: 13, fontWeight: 500 }}>
                  {formatNTD(Number(t.quantity) * Number(t.price))}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Number(t.quantity).toLocaleString()} 股 · {formatNTD(t.price)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddTransactionModal accounts={accounts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function PnlTab({ accounts }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pnlView, setPnlView] = useState('all') // 'all' | 'dividend' | 'sell'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const accountIds = accounts.map(a => a.id)
    if (!accountIds.length) { setLoading(false); return }
    let q = supabase.from('pnl_records').select('*').in('account_id', accountIds).order('record_date', { ascending: false })
    if (dateFrom) q = q.gte('record_date', dateFrom)
    if (dateTo) q = q.lte('record_date', dateTo)
    const { data } = await q
    setRecords(data || [])
    setLoading(false)
  }

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]))
  const filtered = pnlView === 'all' ? records
    : pnlView === 'dividend' ? records.filter(r => r.type === 'dividend' || r.type === 'interest')
    : records.filter(r => r.type === 'sell_profit')

  const totalAmount = filtered.reduce((s, r) => s + Number(r.amount), 0)
  const totalTax = filtered.reduce((s, r) => s + Number(r.tax || 0), 0)
  const totalDividend = records.filter(r => r.type === 'dividend' || r.type === 'interest').reduce((s, r) => s + Number(r.amount), 0)
  const totalSellPnl = records.filter(r => r.type === 'sell_profit').reduce((s, r) => s + Number(r.amount), 0)

  const TYPE_LABELS = { dividend: '股利', sell_profit: '賣出損益', interest: '利息', other: '其他' }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>股利/利息</p>
          <div className="medium-number" style={{ color: 'var(--profit)' }}>+{formatNTD(totalDividend)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom: 4 }}>賣出損益</p>
          <div className="medium-number" style={{ color: formatPctColor(totalSellPnl) }}>
            {totalSellPnl >= 0 ? '+' : ''}{formatNTD(totalSellPnl)}
          </div>
        </div>
      </div>

      {/* Date filter */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
        <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '8px' }} onClick={load}>篩選</button>
        <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {/* Sub filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['all','全部'],['dividend','股利/利息'],['sell','賣出損益']].map(([v, l]) => (
          <button key={v} onClick={() => setPnlView(v)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            background: pnlView === v ? 'var(--accent-blue)' : 'var(--bg-input)',
            color: pnlView === v ? 'white' : 'var(--text-secondary)',
            border: pnlView === v ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>尚無損益紀錄</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => (
            <div key={r.id} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: Number(r.amount) >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              }}>
                <DollarSign size={16} color={Number(r.amount) >= 0 ? 'var(--profit)' : 'var(--loss)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.symbol || TYPE_LABELS[r.type]}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>{TYPE_LABELS[r.type]}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(r.record_date)} · {accountMap[r.account_id] || ''}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="text-mono" style={{ fontSize: 14, fontWeight: 500, color: formatPctColor(r.amount) }}>
                  {Number(r.amount) >= 0 ? '+' : ''}{formatNTD(r.amount)}
                </p>
                {Number(r.tax) > 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>稅 {formatNTD(r.tax)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddPnlModal accounts={accounts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

export default function Invest() {
  const [tab, setTab] = useState('持倉')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('accounts')
        .select('*, holdings(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .neq('type', 'debt')
      setAccounts(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="page fade-in">
      <PageHeader title="投資" />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : (
        <>
          {tab === '持倉' && <HoldingsTab accounts={accounts} />}
          {tab === '交易' && <TransactionsTab accounts={accounts} />}
          {tab === '損益' && <PnlTab accounts={accounts} />}
        </>
      )}
    </div>
  )
}
