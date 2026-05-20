import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronRight, Wallet, Building2, Shield, Landmark, TrendingDown, GripVertical, X, Edit2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD } from '../lib/format'
import { getRates } from '../lib/fx'
import PageHeader from '../components/layout/PageHeader'

const ACCOUNT_TYPES = [
  { value: 'brokerage',   label: '證券帳戶', icon: TrendingDown, color: '#3b82f6' },
  { value: 'bank',        label: '銀行帳戶', icon: Landmark,     color: '#10b981' },
  { value: 'fund',        label: '基金帳戶', icon: Wallet,       color: '#06b6d4' },
  { value: 'insurance',   label: '保單',     icon: Shield,       color: '#8b5cf6' },
  { value: 'real_estate', label: '不動產',   icon: Building2,    color: '#f59e0b' },
  { value: 'crypto',      label: '加密貨幣', icon: Wallet,       color: '#ec4899' },
  { value: 'debt',        label: '負債',     icon: TrendingDown, color: '#ef4444' },
]
const CURRENCIES = ['TWD', 'USD', 'JPY']

function typeInfo(type) {
  return ACCOUNT_TYPES.find(t => t.value === type) || ACCOUNT_TYPES[0]
}

// ── 新增 / 編輯帳戶 Modal ───────────────────────────────────
function AccountModal({ account, onClose, onSaved }) {
  const isEdit = !!account
  const [form, setForm] = useState({
    name: account?.name || '',
    type: account?.type || 'brokerage',
    currency: account?.currency || 'TWD',
    current_value: '',   // 僅新增時用
  })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true); setErrMsg('')
    const { data: { user } } = await supabase.auth.getUser()

    if (isEdit) {
      // 編輯：更新帳戶名稱＆幣別
      const { error } = await supabase.from('accounts')
        .update({ name: form.name.trim(), currency: form.currency })
        .eq('id', account.id)
      if (error) { setErrMsg(error.message); setSaving(false); return }

      // 若有填新現值，更新/新增帳戶現值 holding
      if (form.current_value && Number(form.current_value) >= 0) {
        const { data: existing } = await supabase.from('holdings')
          .select('id').eq('account_id', account.id).eq('symbol', 'CASH').single()
        if (existing) {
          await supabase.from('holdings').update({ quantity: Number(form.current_value) }).eq('id', existing.id)
        } else {
          await supabase.from('holdings').insert({
            account_id: account.id, symbol: 'CASH', name: '帳戶現值',
            market: 'CASH', asset_type: 'cash',
            quantity: Number(form.current_value), avg_cost: 1, current_price: 1,
          })
        }
      }
    } else {
      // 新增
      const { data: acc, error: accErr } = await supabase.from('accounts').insert({
        user_id: user.id, name: form.name.trim(),
        type: form.type, currency: form.currency,
      }).select().single()
      if (accErr) { setErrMsg(accErr.message); setSaving(false); return }

      if (form.current_value && Number(form.current_value) > 0) {
        await supabase.from('holdings').insert({
          account_id: acc.id, symbol: 'CASH', name: '帳戶現值',
          market: 'CASH', asset_type: 'cash',
          quantity: Number(form.current_value), avg_cost: 1, current_price: 1,
        })
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>{isEdit ? '編輯帳戶' : '新增帳戶'}</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <p className="label" style={{ marginBottom:6 }}>帳戶名稱 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
            <input className="input" placeholder="例：元大證券、台新薪轉戶"
              value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          {!isEdit && (
            <div>
              <p className="label" style={{ marginBottom:6 }}>類型</p>
              <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
                {ACCOUNT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>幣別</p>
              <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>
                {isEdit ? '更新現值（選填）' : '現值（選填）'}
              </p>
              <input className="input" type="number" placeholder="0" value={form.current_value}
                onChange={e => set('current_value', e.target.value)} />
            </div>
          </div>
          {form.current_value && form.currency !== 'TWD' && (
            <p style={{ fontSize:11, color:'var(--text-muted)' }}>
              ＊將以當下匯率換算成台幣顯示
            </p>
          )}
          {errMsg && <p style={{ fontSize:12, color:'var(--loss)', textAlign:'center' }}>{errMsg}</p>}
          <button className="btn btn-primary"
            style={{ width:'100%', marginTop:4, opacity:(!form.name.trim()||saving)?0.4:1 }}
            onClick={save} disabled={saving||!form.name.trim()}>
            {saving ? '儲存中...' : isEdit ? '儲存變更' : '新增帳戶'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 新增持倉 Modal ──────────────────────────────────────────
function AddAssetModal({ accountId, onClose, onSaved }) {
  const [form, setForm] = useState({ name:'', symbol:'', market:'TW', asset_type:'stock', quantity:'', avg_cost:'', current_price:'' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const ASSET_TYPES = [
    { value:'stock', label:'股票' }, { value:'etf', label:'ETF' },
    { value:'fund', label:'基金' }, { value:'crypto', label:'加密幣' },
    { value:'cash', label:'現金' },
  ]
  const MARKETS = [
    { value:'TW', label:'台股' }, { value:'US', label:'美股' },
    { value:'JP', label:'日股' }, { value:'CRYPTO', label:'加密' }, { value:'FUND', label:'基金' },
  ]

  async function save() {
    if (!form.name.trim() || !form.quantity) return
    setSaving(true)
    await supabase.from('holdings').insert({
      account_id: accountId,
      symbol: form.symbol.trim().toUpperCase() || form.name.trim(),
      name: form.name.trim(),
      market: form.asset_type==='cash' ? 'CASH' : form.market,
      asset_type: form.asset_type,
      quantity: Number(form.quantity),
      avg_cost: Number(form.avg_cost)||0,
      current_price: Number(form.current_price)||Number(form.avg_cost)||0,
    })
    setSaving(false); onSaved()
  }

  const isCash = form.asset_type === 'cash'
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>新增持倉</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <p className="label" style={{ marginBottom:6 }}>資產類型</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ASSET_TYPES.map(({ value, label }) => (
                <button key={value} onClick={() => set('asset_type', value)} style={{
                  padding:'6px 12px', borderRadius:20, fontSize:13, cursor:'pointer',
                  background: form.asset_type===value?'var(--accent-blue)':'var(--bg-input)',
                  color: form.asset_type===value?'white':'var(--text-secondary)',
                  border: form.asset_type===value?'1px solid var(--accent-blue)':'1px solid var(--border)',
                }}>{label}</button>
              ))}
            </div>
          </div>
          {!isCash && (
            <div>
              <p className="label" style={{ marginBottom:6 }}>市場</p>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {MARKETS.map(({ value, label }) => (
                  <button key={value} onClick={() => set('market', value)} style={{
                    padding:'6px 12px', borderRadius:20, fontSize:13, cursor:'pointer',
                    background: form.market===value?'rgba(59,130,246,0.15)':'var(--bg-input)',
                    color: form.market===value?'var(--accent-blue)':'var(--text-secondary)',
                    border: form.market===value?'1px solid var(--accent-blue)':'1px solid var(--border)',
                  }}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns: isCash?'1fr':'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>名稱</p>
              <input className="input" placeholder={isCash?'例：台幣現金':'例：元大台灣50'} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            {!isCash && (
              <div>
                <p className="label" style={{ marginBottom:6 }}>代號</p>
                <input className="input" placeholder="例：0050" value={form.symbol} onChange={e => set('symbol', e.target.value)} />
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns: isCash?'1fr':'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>{isCash?'金額':'數量（股/單位）'}</p>
              <input className="input" type="number" placeholder="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            {!isCash && (
              <div>
                <p className="label" style={{ marginBottom:6 }}>均價</p>
                <input className="input" type="number" placeholder="0" value={form.avg_cost} onChange={e => set('avg_cost', e.target.value)} />
              </div>
            )}
          </div>
          {!isCash && (
            <div>
              <p className="label" style={{ marginBottom:6 }}>現價（選填）</p>
              <input className="input" type="number" placeholder={form.avg_cost||'0'} value={form.current_price} onChange={e => set('current_price', e.target.value)} />
            </div>
          )}
          <button className="btn btn-primary" style={{ width:'100%', marginTop:4 }}
            onClick={save} disabled={saving||!form.name.trim()||!form.quantity}>
            {saving ? '儲存中...' : '新增持倉'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 再平衡面板 ─────────────────────────────────────────────
function RebalancePanel({ grouped, accountTotalTWD, totalTWD }) {
  const STORAGE_KEY = 'rebalance_targets'
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  })

  function setTarget(type, val) {
    const next = { ...targets, [type]: Number(val) || 0 }
    setTargets(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0)
  const investGroups = grouped.filter(g => g.value !== 'debt')

  return (
    <div style={{ marginTop:8, background:'var(--bg-surface)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>設定目標佔比（總計 {totalTarget}%）</span>
        <span style={{ fontSize:12, color: Math.abs(totalTarget - 100) < 1 ? 'var(--profit)' : 'var(--accent-amber)' }}>
          {Math.abs(totalTarget - 100) < 1 ? '✓ 合計 100%' : `差 ${(100 - totalTarget).toFixed(0)}%`}
        </span>
      </div>

      {investGroups.map(({ value, label, icon: Icon, color, accounts: accs }) => {
        const groupTotal = accs.reduce((s, a) => s + accountTotalTWD(a), 0)
        const currentPct = totalTWD > 0 ? (groupTotal / totalTWD) * 100 : 0
        const targetPct = targets[value] || 0
        const diff = currentPct - targetPct
        const diffAbs = Math.abs(diff)
        const diffColor = diffAbs < 2 ? 'var(--profit)' : diffAbs < 5 ? 'var(--accent-amber)' : 'var(--loss)'

        return (
          <div key={value} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize:13, fontWeight:500, flex:1 }}>{label}</span>
              {/* Target input */}
              <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>目標</span>
                <input
                  type="number" min="0" max="100"
                  value={targetPct || ''}
                  placeholder="0"
                  onChange={e => setTarget(value, e.target.value)}
                  style={{
                    width:48, padding:'4px 6px', borderRadius:6, fontSize:13, fontFamily:'DM Mono',
                    background:'var(--bg-input)', border:'1px solid var(--border)',
                    color:'var(--text-primary)', textAlign:'center', outline:'none',
                  }}
                />
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ flex:1, height:6, background:'var(--bg-input)', borderRadius:3, overflow:'hidden', position:'relative' }}>
                {/* Target marker */}
                {targetPct > 0 && (
                  <div style={{
                    position:'absolute', top:0, bottom:0,
                    left:`${Math.min(targetPct, 100)}%`,
                    width:2, background:'var(--text-muted)', borderRadius:1,
                    transform:'translateX(-50%)', zIndex:2,
                  }} />
                )}
                {/* Current bar */}
                <div style={{
                  height:'100%', width:`${Math.min(currentPct, 100)}%`,
                  background: color, borderRadius:3, transition:'width 0.4s ease',
                }} />
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, minWidth:130 }}>
                <span style={{ fontSize:11, fontFamily:'DM Mono', color:'var(--text-secondary)', minWidth:36, textAlign:'right' }}>
                  {currentPct.toFixed(1)}%
                </span>
                {targetPct > 0 && (
                  <span style={{ fontSize:11, fontFamily:'DM Mono', color: diffColor, minWidth:52 }}>
                    {diff > 0 ? '▲' : '▼'} {diffAbs.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            {/* Diff amount hint */}
            {targetPct > 0 && diffAbs > 1 && (
              <p style={{ fontSize:11, color: diffColor, marginTop:4, textAlign:'right' }}>
                {diff > 0
                  ? `超配 NT$ ${formatNTD(Math.abs(diff / 100 * totalTWD))}，可考慮減碼`
                  : `低配 NT$ ${formatNTD(Math.abs(diff / 100 * totalTWD))}，可考慮加碼`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 可拖曳帳戶列表 ──────────────────────────────────────────
function DraggableAccountList({ accounts, rates, totalAllTWD, onReorder, onAddHolding, onEdit }) {
  const [items, setItems] = useState(accounts)
  const [expanded, setExpanded] = useState({})
  const dragIdx = useRef(null)
  const dragOverIdx = useRef(null)

  useEffect(() => { setItems(accounts) }, [accounts])

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  function accountTotalTWD(acc) {
    const rate = rates[acc.currency] || 1
    return (acc.holdings||[]).reduce((s, h) =>
      h.asset_type==='cash'
        ? s + Number(h.quantity) * rate
        : s + Number(h.current_price) * Number(h.quantity) * rate
    , 0)
  }

  function onDragStart(i) { dragIdx.current = i }
  function onDragEnter(i) { dragOverIdx.current = i }
  function onDragEnd() {
    if (dragIdx.current === null || dragOverIdx.current === null || dragIdx.current === dragOverIdx.current) return
    const next = [...items]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(dragOverIdx.current, 0, moved)
    dragIdx.current = null; dragOverIdx.current = null
    setItems(next)
    onReorder(next.map(a => a.id))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      {items.map((acc, i) => {
        const total = accountTotalTWD(acc)
        const rate = rates[acc.currency] || 1
        const isDebt = acc.type === 'debt'
        const isOpen = expanded[acc.id]
        const isForeign = acc.currency !== 'TWD'

        return (
          <div key={acc.id}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnter={() => onDragEnter(i)}
            onDragEnd={onDragEnd}
            onDragOver={e => e.preventDefault()}
            style={{ background:'var(--bg-card)', borderRadius:'var(--radius-md)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center' }}>
              <div style={{ padding:'0 4px 0 10px', cursor:'grab', color:'var(--border-light)', display:'flex', alignItems:'center', flexShrink:0 }}>
                <GripVertical size={14} />
              </div>
              <button onClick={() => toggle(acc.id)} style={{
                flex:1, display:'flex', alignItems:'center', gap:10,
                padding:'12px 8px 12px 4px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left',
              }}>
                {/* 佔比 badge */}
                <div style={{
                  minWidth:36, textAlign:'center', padding:'2px 6px',
                  background:'var(--bg-input)', borderRadius:6, flexShrink:0,
                }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', fontFamily:'DM Mono' }}>
                    {totalAllTWD > 0 ? Math.round(total / totalAllTWD * 100) : 0}%
                  </span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>{acc.name}</p>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:1 }}>
                    {acc.currency}
                    {isForeign && total > 0 && (
                      <span style={{ marginLeft:6, color:'var(--accent-amber)' }}>
                        {acc.currency} {formatNTD(total / rate)}
                      </span>
                    )}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginRight:4 }}>
                  <p className="text-mono" style={{ fontSize:14, fontWeight:600, color: isDebt?'var(--loss)':'var(--text-primary)' }}>
                    {isDebt?'-':''}NT$ {formatNTD(total)}
                  </p>
                </div>
                <ChevronRight size={14} color="var(--text-muted)"
                  style={{ transform: isOpen?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }} />
              </button>
              <button onClick={() => onEdit(acc)}
                style={{ padding:'0 12px 0 0', background:'transparent', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', flexShrink:0 }}>
                <Edit2 size={14} />
              </button>
            </div>

            {isOpen && (
              <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg-base)' }}>
                {(acc.holdings||[]).map(h => {
                  const valNative = h.asset_type==='cash' ? Number(h.quantity) : Number(h.current_price)*Number(h.quantity)
                  const valTWD = valNative * rate
                  return (
                    <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontSize:12, fontWeight:500 }}>{h.name||h.symbol}</p>
                        <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                          {h.asset_type==='cash'
                            ? `現金 ${isForeign ? `${acc.currency} ${formatNTD(h.quantity)}` : `NT$ ${formatNTD(h.quantity)}`}`
                            : `${Number(h.quantity).toLocaleString()} 股 · 均 ${formatNTD(h.avg_cost)}`}
                        </p>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <p style={{ fontSize:12, fontWeight:500 }}>NT$ {formatNTD(valTWD)}</p>
                        {isForeign && h.asset_type==='cash' && (
                          <p style={{ fontSize:10, color:'var(--text-muted)' }}>{acc.currency} {formatNTD(valNative)}</p>
                        )}
                        {h.asset_type!=='cash' && (
                          <p style={{ fontSize:11, color: Number(h.current_price)>=Number(h.avg_cost)?'var(--profit)':'var(--loss)' }}>
                            {Number(h.avg_cost)>0 ? ((Number(h.current_price)-Number(h.avg_cost))/Number(h.avg_cost)*100).toFixed(2)+'%' : '—'}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => onAddHolding(acc.id)}
                  style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'10px 16px', background:'transparent', border:'none', cursor:'pointer', color:'var(--accent-blue)', fontSize:13, fontWeight:500 }}>
                  <Plus size={14} /> 新增持倉
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function Assets() {
  const [accounts, setAccounts] = useState([])
  const [rates, setRates] = useState({ TWD:1 })
  const [loading, setLoading] = useState(true)
  const [rateLoading, setRateLoading] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [addAssetFor, setAddAssetFor] = useState(null)
  const [expandedTypes, setExpandedTypes] = useState({})
  const [showRebalance, setShowRebalance] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('accounts').select('*, holdings(*)')
      .eq('user_id', user.id).eq('is_active', true)
      .order('created_at')

    const accs = data || []
    setAccounts(accs)

    // 預設展開所有類型
    const types = [...new Set(accs.map(a => a.type))]
    setExpandedTypes(Object.fromEntries(types.map(t => [t, true])))
    setLoading(false)

    // 非同步抓匯率
    const currencies = [...new Set(accs.map(a => a.currency))]
    if (currencies.some(c => c !== 'TWD')) {
      setRateLoading(true)
      const r = await getRates(currencies)
      setRates(r)
      setRateLoading(false)
    }
  }

  async function refreshRates() {
    setRateLoading(true)
    const currencies = [...new Set(accounts.map(a => a.currency))]
    const r = await getRates(currencies)
    setRates(r)
    setRateLoading(false)
  }

  function accountTotalTWD(acc) {
    const rate = rates[acc.currency] || 1
    return (acc.holdings||[]).reduce((s, h) =>
      h.asset_type==='cash'
        ? s + Number(h.quantity) * rate
        : s + Number(h.current_price) * Number(h.quantity) * rate
    , 0)
  }

  const grouped = ACCOUNT_TYPES.map(type => ({
    ...type, accounts: accounts.filter(a => a.type === type.value),
  })).filter(g => g.accounts.length > 0)

  const totalPos = accounts.filter(a=>a.type!=='debt').reduce((s,a)=>s+accountTotalTWD(a),0)
  const totalDebt = accounts.filter(a=>a.type==='debt').reduce((s,a)=>s+accountTotalTWD(a),0)
  const netAssets = totalPos - totalDebt

  const hasForeign = accounts.some(a => a.currency !== 'TWD')

  return (
    <div className="page fade-in">
      <PageHeader
        title="資產"
        subtitle={`淨資產 NT$ ${formatNTD(netAssets)}`}
        action={
          <div style={{ display:'flex', gap:8 }}>
            {hasForeign && (
              <button className="btn btn-icon" onClick={refreshRates} title="更新匯率"
                style={{ opacity: rateLoading?0.5:1 }}>
                <RefreshCw size={14} style={{ animation: rateLoading?'spin 1s linear infinite':undefined }} />
              </button>
            )}
            <button className="btn btn-primary" style={{ padding:'8px 14px', fontSize:13 }}
              onClick={() => setShowAddAccount(true)}>
              <Plus size={15} /> 新增帳戶
            </button>
          </div>
        }
      />

      {/* 匯率顯示 */}
      {hasForeign && Object.keys(rates).filter(c=>c!=='TWD').length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          {Object.entries(rates).filter(([c])=>c!=='TWD').map(([c, r]) => (
            <div key={c} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 10px', fontSize:11 }}>
              <span style={{ color:'var(--text-muted)' }}>1 {c} = </span>
              <span style={{ color:'var(--accent-amber)', fontFamily:'DM Mono' }}>NT$ {r.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:72, borderRadius:'var(--radius-lg)' }} />)}
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
          <p style={{ fontSize:14 }}>尚無帳戶</p>
          <p style={{ fontSize:12, marginTop:4 }}>點右上角新增第一個帳戶</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {grouped.map(({ value, label, icon: Icon, color, accounts: accs }) => {
            const groupTotal = accs.reduce((s,a)=>s+accountTotalTWD(a),0)
            const isDebtType = value === 'debt'
            const isOpen = expandedTypes[value]

            return (
              <div key={value} className="card" style={{ padding:0, overflow:'hidden' }}>
                <button onClick={() => setExpandedTypes(e=>({...e,[value]:!e[value]}))} style={{
                  display:'flex', alignItems:'center', gap:12, width:'100%',
                  padding:'14px 16px', background:'transparent', border:'none', cursor:'pointer',
                }}>
                  <div style={{ width:34, height:34, borderRadius:'var(--radius-sm)', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon size={17} color={color} />
                  </div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <p style={{ fontSize:14, fontWeight:600 }}>{label}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{accs.length} 個帳戶</p>
                  </div>
                  <p className="text-mono" style={{ fontSize:15, fontWeight:500, color: isDebtType?'var(--loss)':'var(--text-primary)', flexShrink:0 }}>
                    {isDebtType?'-':''}NT$ {formatNTD(groupTotal)}
                  </p>
                  <ChevronRight size={16} color="var(--text-muted)"
                    style={{ transform: isOpen?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }} />
                </button>

                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'8px 10px', background:'var(--bg-surface)', display:'flex', flexDirection:'column', gap:6 }}>
                    <DraggableAccountList
                      accounts={accs}
                      rates={rates}
                      totalAllTWD={netAssets + totalDebt}
                      onReorder={ids => setAccounts(prev => {
                        const others = prev.filter(a => a.type !== value)
                        const reordered = ids.map(id => prev.find(a => a.id === id)).filter(Boolean)
                        return [...others, ...reordered]
                      })}
                      onAddHolding={id => setAddAssetFor(id)}
                      onEdit={acc => setEditAccount(acc)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Rebalance section */}
      {grouped.length > 0 && (
        <div style={{ marginTop:4 }}>
          <button onClick={() => setShowRebalance(r => !r)} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
            padding:'14px 16px', background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', cursor:'pointer',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'var(--radius-sm)', background:'rgba(139,92,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:16 }}>⚖️</span>
              </div>
              <div style={{ textAlign:'left' }}>
                <p style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>再平衡規劃</p>
                <p style={{ fontSize:11, color:'var(--text-muted)' }}>設定目標佔比，檢視偏差</p>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" style={{ transform: showRebalance?'rotate(90deg)':'none', transition:'transform 0.2s' }} />
          </button>

          {showRebalance && (
            <RebalancePanel grouped={grouped} accountTotalTWD={accountTotalTWD} totalTWD={netAssets + totalDebt} />
          )}
        </div>
      )}

      {/* spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {(showAddAccount || editAccount) && (
        <AccountModal
          account={editAccount}
          onClose={() => { setShowAddAccount(false); setEditAccount(null) }}
          onSaved={() => { setShowAddAccount(false); setEditAccount(null); loadAll() }}
        />
      )}
      {addAssetFor && (
        <AddAssetModal
          accountId={addAssetFor}
          onClose={() => setAddAssetFor(null)}
          onSaved={() => { setAddAssetFor(null); loadAll() }}
        />
      )}
    </div>
  )
}
