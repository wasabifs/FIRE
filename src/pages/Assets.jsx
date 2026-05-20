import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronRight, Wallet, Building2, Shield, Landmark, TrendingDown, GripVertical, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD } from '../lib/format'
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

// ── 新增帳戶 Modal ──────────────────────────────────────────
function AddAccountModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', type: 'brokerage', currency: 'TWD', current_value: '' })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setErrMsg('')
    const { data: { user } } = await supabase.auth.getUser()

    // 先建帳戶
    const { data: acc, error: accErr } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: form.name.trim(),
      type: form.type,
      currency: form.currency,
    }).select().single()

    if (accErr) { setErrMsg(accErr.message); setSaving(false); return }

    // 若有填現值，自動建一筆現金 holding 代表該帳戶餘額
    if (form.current_value && Number(form.current_value) > 0) {
      await supabase.from('holdings').insert({
        account_id: acc.id,
        symbol: 'CASH',
        name: '帳戶現值',
        market: 'CASH',
        asset_type: 'cash',
        quantity: Number(form.current_value),
        avg_cost: 1,
        current_price: 1,
      })
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>新增帳戶</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <p className="label" style={{ marginBottom:6 }}>帳戶名稱 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
            <input className="input" placeholder="例：元大證券、台新薪轉戶" value={form.name}
              onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div>
            <p className="label" style={{ marginBottom:6 }}>類型</p>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              {ACCOUNT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>幣別</p>
              <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>現值（選填）</p>
              <input className="input" type="number" placeholder="0" value={form.current_value}
                onChange={e => set('current_value', e.target.value)} />
            </div>
          </div>
          {errMsg && <p style={{ fontSize:12, color:'var(--loss)', textAlign:'center' }}>{errMsg}</p>}
          <button className="btn btn-primary"
            style={{ width:'100%', marginTop:4, opacity:(!form.name.trim()||saving)?0.4:1 }}
            onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? '儲存中...' : '新增帳戶'}
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
      market: form.asset_type === 'cash' ? 'CASH' : form.market,
      asset_type: form.asset_type,
      quantity: Number(form.quantity),
      avg_cost: Number(form.avg_cost) || 0,
      current_price: Number(form.current_price) || Number(form.avg_cost) || 0,
    })
    setSaving(false)
    onSaved()
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
                  background: form.asset_type===value ? 'var(--accent-blue)' : 'var(--bg-input)',
                  color: form.asset_type===value ? 'white' : 'var(--text-secondary)',
                  border: form.asset_type===value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
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
                    background: form.market===value ? 'rgba(59,130,246,0.15)' : 'var(--bg-input)',
                    color: form.market===value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: form.market===value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
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
            onClick={save} disabled={saving || !form.name.trim() || !form.quantity}>
            {saving ? '儲存中...' : '新增持倉'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 可拖曳帳戶列表（同類型內） ──────────────────────────────
function DraggableAccountList({ accounts, onReorder, onAddHolding }) {
  const [items, setItems] = useState(accounts)
  const [expanded, setExpanded] = useState({})
  const dragIdx = useRef(null)
  const dragOverIdx = useRef(null)

  useEffect(() => { setItems(accounts) }, [accounts])

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  function onDragStart(i) { dragIdx.current = i }
  function onDragEnter(i) { dragOverIdx.current = i }
  function onDragEnd() {
    if (dragIdx.current === null || dragOverIdx.current === null) return
    if (dragIdx.current === dragOverIdx.current) return
    const next = [...items]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(dragOverIdx.current, 0, moved)
    dragIdx.current = null
    dragOverIdx.current = null
    setItems(next)
    onReorder(next.map(a => a.id))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      {items.map((acc, i) => {
        const total = (acc.holdings||[]).reduce((s, h) =>
          h.asset_type==='cash' ? s+Number(h.quantity) : s+Number(h.current_price)*Number(h.quantity), 0)
        const isDebt = acc.type === 'debt'
        const isOpen = expanded[acc.id]

        return (
          <div key={acc.id}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnter={() => onDragEnter(i)}
            onDragEnd={onDragEnd}
            onDragOver={e => e.preventDefault()}
            style={{ background:'var(--bg-card)', borderRadius:'var(--radius-md)', overflow:'hidden', transition:'opacity 0.15s' }}>
            <div style={{ display:'flex', alignItems:'center' }}>
              {/* Drag handle */}
              <div style={{ padding:'0 6px 0 12px', cursor:'grab', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                <GripVertical size={14} />
              </div>
              <button onClick={() => toggle(acc.id)} style={{
                flex:1, display:'flex', alignItems:'center', gap:10,
                padding:'12px 14px 12px 4px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left',
              }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{acc.name}</p>
                  <p style={{ fontSize:11, color:'var(--text-muted)' }}>{acc.currency}</p>
                </div>
                <p className="text-mono" style={{ fontSize:14, fontWeight:500, color: isDebt?'var(--loss)':'var(--text-primary)', flexShrink:0 }}>
                  {isDebt?'-':''}NT$ {formatNTD(total)}
                </p>
                <ChevronRight size={14} color="var(--text-muted)"
                  style={{ transform: isOpen?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }} />
              </button>
            </div>

            {isOpen && (
              <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg-base)' }}>
                {(acc.holdings||[]).map(h => (
                  <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <p style={{ fontSize:12, fontWeight:500 }}>{h.name||h.symbol}</p>
                      <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                        {h.asset_type==='cash' ? `現金 NT$ ${formatNTD(h.quantity)}` : `${Number(h.quantity).toLocaleString()} 股 · 均 ${formatNTD(h.avg_cost)}`}
                      </p>
                    </div>
                    {h.asset_type!=='cash' && (
                      <div style={{ textAlign:'right' }}>
                        <p style={{ fontSize:12, fontWeight:500 }}>NT$ {formatNTD(Number(h.current_price)*Number(h.quantity))}</p>
                        <p style={{ fontSize:11, color: Number(h.current_price)>=Number(h.avg_cost)?'var(--profit)':'var(--loss)' }}>
                          {Number(h.avg_cost)>0 ? ((Number(h.current_price)-Number(h.avg_cost))/Number(h.avg_cost)*100).toFixed(2)+'%' : '—'}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
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
  const [loading, setLoading] = useState(true)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [addAssetFor, setAddAssetFor] = useState(null)
  const [expandedTypes, setExpandedTypes] = useState({})

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('accounts').select('*, holdings(*)')
      .eq('user_id', user.id).eq('is_active', true)
      .order('created_at')
    setAccounts(data || [])
    // 預設展開所有類型
    const types = [...new Set((data||[]).map(a => a.type))]
    setExpandedTypes(Object.fromEntries(types.map(t => [t, true])))
    setLoading(false)
  }

  function accountTotal(acc) {
    return (acc.holdings||[]).reduce((s, h) =>
      h.asset_type==='cash' ? s+Number(h.quantity) : s+Number(h.current_price)*Number(h.quantity), 0)
  }

  // 依類型分組
  const grouped = ACCOUNT_TYPES.map(type => ({
    ...type,
    accounts: accounts.filter(a => a.type === type.value),
  })).filter(g => g.accounts.length > 0)

  const totalPos = accounts.filter(a=>a.type!=='debt').reduce((s,a)=>s+accountTotal(a),0)
  const totalDebt = accounts.filter(a=>a.type==='debt').reduce((s,a)=>s+accountTotal(a),0)
  const netAssets = totalPos - totalDebt

  function toggleType(type) {
    setExpandedTypes(e => ({ ...e, [type]: !e[type] }))
  }

  function handleReorder(type, orderedIds) {
    // 更新本地順序（不需要寫回DB，刷頁後會重置——可未來加 sort_order 欄位）
    setAccounts(prev => {
      const others = prev.filter(a => a.type !== type)
      const reordered = orderedIds.map(id => prev.find(a => a.id === id)).filter(Boolean)
      return [...others, ...reordered]
    })
  }

  return (
    <div className="page fade-in">
      <PageHeader
        title="資產"
        subtitle={`淨資產 NT$ ${formatNTD(netAssets)}`}
        action={
          <button className="btn btn-primary" style={{ padding:'8px 14px', fontSize:13 }}
            onClick={() => setShowAddAccount(true)}>
            <Plus size={15} /> 新增帳戶
          </button>
        }
      />

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
            const groupTotal = accs.reduce((s, a) => s + accountTotal(a), 0)
            const isDebtType = value === 'debt'
            const isOpen = expandedTypes[value]

            return (
              <div key={value} className="card" style={{ padding:0, overflow:'hidden' }}>
                {/* Type header */}
                <button onClick={() => toggleType(value)} style={{
                  display:'flex', alignItems:'center', gap:12, width:'100%',
                  padding:'14px 16px', background:'transparent', border:'none', cursor:'pointer',
                }}>
                  <div style={{ width:34, height:34, borderRadius:'var(--radius-sm)', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon size={17} color={color} />
                  </div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <p style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{label}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{accs.length} 個帳戶</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p className="text-mono" style={{ fontSize:15, fontWeight:500, color: isDebtType?'var(--loss)':'var(--text-primary)' }}>
                      {isDebtType?'-':''}NT$ {formatNTD(groupTotal)}
                    </p>
                  </div>
                  <ChevronRight size={16} color="var(--text-muted)"
                    style={{ transform: isOpen?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }} />
                </button>

                {/* Accounts under this type */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'8px 10px', background:'var(--bg-surface)', display:'flex', flexDirection:'column', gap:6 }}>
                    <DraggableAccountList
                      accounts={accs}
                      onReorder={ids => handleReorder(value, ids)}
                      onAddHolding={id => setAddAssetFor(id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onSaved={() => { setShowAddAccount(false); loadAccounts() }}
        />
      )}
      {addAssetFor && (
        <AddAssetModal
          accountId={addAssetFor}
          onClose={() => setAddAssetFor(null)}
          onSaved={() => { setAddAssetFor(null); loadAccounts() }}
        />
      )}
    </div>
  )
}
