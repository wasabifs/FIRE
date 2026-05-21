import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, ChevronRight, Wallet, Building2, Shield, Landmark, TrendingDown, GripVertical, X, Edit2, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD } from '../lib/format'
import { getRates } from '../lib/fx'
import { lookupSymbol } from '../lib/quote'
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

const ASSET_TYPES = [
  { value: 'stock',  label: '股票' },
  { value: 'etf',    label: 'ETF' },
  { value: 'fund',   label: '基金' },
  { value: 'crypto', label: '加密幣' },
  { value: 'cash',   label: '現金' },
]

const MARKETS = [
  { value: 'TW',     label: '台股' },
  { value: 'US',     label: '美股' },
  { value: 'JP',     label: '日股' },
  { value: 'CRYPTO', label: '加密' },
  { value: 'FUND',   label: '基金' },
]

function typeInfo(type) {
  return ACCOUNT_TYPES.find(t => t.value === type) || ACCOUNT_TYPES[0]
}

// ── 代號自動查詢 hook（同 Invest）──────────────────────────
function useSymbolLookup(symbol, market, onResult) {
  const timer = useRef(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!symbol.trim()) setError('')
  }, [symbol])

  function trigger(sym, mkt) {
    clearTimeout(timer.current)
    setError('')
    if (!sym.trim() || !['TW','US','JP'].includes(mkt)) return
    timer.current = setTimeout(async () => {
      setLooking(true)
      const result = await lookupSymbol(sym.trim(), mkt)
      setLooking(false)
      if (result) {
        setError('')
        onResult(result)
      } else if (sym.trim().length >= 2) {
        setError('查無此代號，可手動填入名稱')
      }
    }, 800)
  }

  return { looking, error, trigger }
}

// ── 新增 / 編輯帳戶 Modal ───────────────────────────────────
function AccountModal({ account, onClose, onSaved }) {
  const isEdit = !!account
  const [form, setForm] = useState({
    name: account?.name || '',
    type: account?.type || 'brokerage',
    currency: account?.currency || 'TWD',
    current_value: '',
  })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true); setErrMsg('')
    const { data: { user } } = await supabase.auth.getUser()

    if (isEdit) {
      const { error } = await supabase.from('accounts')
        .update({ name: form.name.trim(), currency: form.currency })
        .eq('id', account.id)
      if (error) { setErrMsg(error.message); setSaving(false); return }

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

// ── 新增持倉 Modal（與投資頁一致）──────────────────────────
function AddAssetModal({ accountId, accounts, onClose, onSaved }) {
  // 找出這個 accountId 所屬的帳戶，預設選中
  const defaultAcc = accounts?.find(a => a.id === accountId) || accounts?.[0]
  const [form, setForm] = useState({
    asset_type: 'stock',
    account_id: accountId || defaultAcc?.id || '',
    symbol: '', name: '', market: 'TW', quantity: '', total_cost: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { looking, error, trigger } = useSymbolLookup(form.symbol, form.market, r => set('name', r.name))

  const avgCost = (form.quantity && form.total_cost && Number(form.quantity) > 0)
    ? Number(form.total_cost) / Number(form.quantity) : null

  async function save() {
    if (!form.symbol || !form.quantity || !form.total_cost) return
    setSaving(true)
    await supabase.from('holdings').insert({
      account_id: form.account_id,
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim() || form.symbol.trim().toUpperCase(),
      market: form.market, asset_type: form.asset_type,
      quantity: Number(form.quantity),
      avg_cost: avgCost || 0,
      current_price: avgCost || 0,
    })
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>新增持倉</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* 資產類型 */}
          <div>
            <p className="label" style={{ marginBottom:6 }}>資產類型</p>
            <select className="input" value={form.asset_type} onChange={e => set('asset_type', e.target.value)}>
              {ASSET_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {/* 帳戶（若從主頁新增則顯示，可切換） */}
          {accounts && accounts.length > 1 && (
            <div>
              <p className="label" style={{ marginBottom:6 }}>帳戶</p>
              <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          {/* 市場 + 代號 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>市場</p>
              <select className="input" value={form.market} onChange={e => { set('market', e.target.value); trigger(form.symbol, e.target.value) }}>
                {MARKETS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>代號 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <div style={{ position:'relative' }}>
                <input className="input" placeholder="例：0050" value={form.symbol}
                  onChange={e => { set('symbol', e.target.value); trigger(e.target.value, form.market) }}
                  style={{ paddingRight: looking ? 36 : 14 }} autoFocus />
                {looking && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}>
                  <RefreshCw size={14} color="var(--accent-blue)" style={{ animation:'spin 1s linear infinite' }} />
                </div>}
              </div>
            </div>
          </div>
          {/* 名稱 */}
          <div>
            <p className="label" style={{ marginBottom:6 }}>
              名稱
              {looking && <span style={{ color:'var(--accent-blue)', marginLeft:6, fontSize:10 }}>查詢中...</span>}
              {!looking && form.name && <span style={{ color:'var(--profit)', marginLeft:6, fontSize:10 }}>✓ 已自動帶入</span>}
            </p>
            <input className="input" placeholder="例：元大台灣50" value={form.name} onChange={e => set('name', e.target.value)} />
            {error && <p style={{ fontSize:11, color:'var(--accent-amber)', marginTop:4 }}>{error}</p>}
          </div>
          {/* 股數 + 總成本 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>股數 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <input className="input" type="number" placeholder="0" step="0.00001" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>總成本 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <input className="input" type="number" placeholder="0" value={form.total_cost} onChange={e => set('total_cost', e.target.value)} />
            </div>
          </div>
          {/* 均價自動計算 */}
          <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'var(--text-secondary)' }}>均價（自動計算）</span>
            <span className="text-mono" style={{ fontSize:15, fontWeight:600, color:avgCost?'var(--text-primary)':'var(--text-muted)' }}>
              {avgCost ? formatNTD(Number(avgCost).toFixed(2)) : '—'}
            </span>
          </div>
          <button className="btn btn-primary" style={{ width:'100%', marginTop:4 }}
            onClick={save} disabled={saving || !form.symbol || !form.quantity || !form.total_cost}>
            {saving ? '儲存中...' : '新增持倉'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 持倉編輯 Modal（資產頁用）──────────────────────────────
function EditHoldingModal({ holding, onClose, onSaved }) {
  const [form, setForm] = useState({
    quantity: String(holding.quantity),
    total_cost: String((Number(holding.quantity) * Number(holding.avg_cost)).toFixed(2)),
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const avgCost = (form.quantity && form.total_cost && Number(form.quantity) > 0)
    ? Number(form.total_cost) / Number(form.quantity) : null

  async function save() {
    if (!form.quantity || !form.total_cost) return
    setSaving(true)
    await supabase.from('holdings').update({
      quantity: Number(form.quantity),
      avg_cost: avgCost || 0,
    }).eq('id', holding.id)
    setSaving(false); onSaved()
  }

  async function remove() {
    if (!confirm(`確定刪除 ${holding.name || holding.symbol} 持倉？`)) return
    setSaving(true)
    await supabase.from('holdings').delete().eq('id', holding.id)
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:360, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:600 }}>{holding.symbol}</h2>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{holding.name}</p>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>股數</p>
              <input className="input" type="number" step="0.00001" value={form.quantity} onChange={e => set('quantity', e.target.value)} autoFocus />
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>總成本</p>
              <input className="input" type="number" step="0.01" value={form.total_cost} onChange={e => set('total_cost', e.target.value)} />
            </div>
          </div>
          <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, color:'var(--text-secondary)' }}>均價（自動計算）</span>
            <span className="text-mono" style={{ fontSize:13, fontWeight:600, color:avgCost?'var(--text-primary)':'var(--text-muted)' }}>
              {avgCost ? formatNTD(Number(avgCost).toFixed(2)) : '—'}
            </span>
          </div>
          <button className="btn btn-primary" style={{ width:'100%' }} onClick={save} disabled={saving || !form.quantity || !form.total_cost}>
            {saving ? '儲存中...' : '儲存變更'}
          </button>
          <button onClick={remove} disabled={saving} style={{
            width:'100%', padding:'10px', borderRadius:'var(--radius-md)',
            border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)',
            color:'var(--loss)', fontSize:13, cursor:'pointer', fontFamily:'DM Sans',
          }}>刪除此持倉</button>
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

            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ flex:1, height:6, background:'var(--bg-input)', borderRadius:3, overflow:'hidden', position:'relative' }}>
                {targetPct > 0 && (
                  <div style={{
                    position:'absolute', top:0, bottom:0,
                    left:`${Math.min(targetPct, 100)}%`,
                    width:2, background:'var(--text-muted)', borderRadius:1,
                    transform:'translateX(-50%)', zIndex:2,
                  }} />
                )}
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
  const [editHolding, setEditHolding] = useState(null)
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
                <div style={{
                  minWidth:36, textAlign:'center', padding:'2px 6px',
                  background:'rgba(255,255,255,0.06)', borderRadius:6, flexShrink:0,
                  border:'1px solid var(--border)',
                }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text-primary)', fontFamily:'DM Mono' }}>
                    {totalAllTWD > 0 ? Math.round(total / totalAllTWD * 100) : 0}%
                  </span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>{acc.name}</p>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:1 }}>
                    {isForeign && total > 0
                      ? <><span style={{ color:'var(--accent-amber)' }}>{acc.currency}</span> {formatNTD(total / rate)}</>
                      : acc.currency
                    }
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
                  const pct = h.asset_type !== 'cash' && Number(h.avg_cost) > 0
                    ? ((Number(h.current_price) - Number(h.avg_cost)) / Number(h.avg_cost) * 100)
                    : null
                  return (
                    <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:500 }}>{h.name||h.symbol}</p>
                        <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                          {h.asset_type==='cash'
                            ? `現金 ${isForeign ? `${acc.currency} ${formatNTD(h.quantity)}` : `NT$ ${formatNTD(h.quantity)}`}`
                            : `${Number(h.quantity).toLocaleString()} 股 · 均 ${formatNTD(h.avg_cost)}`}
                        </p>
                      </div>
                      <div style={{ textAlign:'right', marginRight:8 }}>
                        <p style={{ fontSize:12, fontWeight:500 }}>NT$ {formatNTD(valTWD)}</p>
                        {isForeign && h.asset_type==='cash' && (
                          <p style={{ fontSize:10, color:'var(--text-muted)' }}>{acc.currency} {formatNTD(valNative)}</p>
                        )}
                        {h.asset_type !== 'cash' && pct !== null && (
                          <p style={{ fontSize:11, color: pct >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                          </p>
                        )}
                      </div>
                      {/* 現金：刪除按鈕；非現金：編輯按鈕 */}
                      {h.asset_type === 'cash' ? (
                        <button onClick={async () => {
                          if (!confirm('確定刪除此現金記錄？')) return
                          await supabase.from('holdings').delete().eq('id', h.id)
                          onEdit('__refresh__')
                        }} style={{
                          flexShrink:0, width:26, height:26, borderRadius:6,
                          background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          cursor:'pointer', color:'var(--loss)',
                        }}><Trash2 size={11} /></button>
                      ) : (
                        <button onClick={() => setEditHolding(h)} style={{
                          flexShrink:0, width:26, height:26, borderRadius:6,
                          background:'var(--bg-input)', border:'1px solid var(--border)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          cursor:'pointer', color:'var(--text-muted)',
                        }}><Edit2 size={11} /></button>
                      )}
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

      {/* 持倉編輯 Modal */}
      {editHolding && (
        <EditHoldingModal
          holding={editHolding}
          onClose={() => setEditHolding(null)}
          onSaved={() => { setEditHolding(null); onEdit('__refresh__') }}
        />
      )}
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

    const types = [...new Set(accs.map(a => a.type))]
    setExpandedTypes(Object.fromEntries(types.map(t => [t, true])))
    setLoading(false)

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
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {hasForeign && (
              <button className="btn btn-icon" onClick={refreshRates} title="更新匯率"
                style={{ opacity: rateLoading?0.5:1 }}>
                <RefreshCw size={14} style={{ animation: rateLoading?'spin 1s linear infinite':undefined }} />
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding:'7px 12px', fontSize:12, display:'flex', alignItems:'center', gap:5 }}
              onClick={() => setShowRebalance(r => !r)}>
              <span>⚖️</span> 再平衡
            </button>
            <button className="btn btn-primary" style={{ padding:'7px 12px', fontSize:12 }}
              onClick={() => setShowAddAccount(true)}>
              <Plus size={14} /> 新增
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
                      onEdit={accOrSignal => {
                        if (accOrSignal === '__refresh__') loadAll()
                        else setEditAccount(accOrSignal)
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showRebalance && grouped.length > 0 && (
        <RebalancePanel grouped={grouped} accountTotalTWD={accountTotalTWD} totalTWD={netAssets + totalDebt} />
      )}

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
          accounts={accounts}
          onClose={() => setAddAssetFor(null)}
          onSaved={() => { setAddAssetFor(null); loadAll() }}
        />
      )}
    </div>
  )
}
