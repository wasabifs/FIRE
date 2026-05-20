import { useState, useEffect } from 'react'
import { Plus, ChevronRight, Wallet, Building2, Shield, Landmark, TrendingDown, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD } from '../lib/format'
import PageHeader from '../components/layout/PageHeader'

const ACCOUNT_TYPES = [
  { value: 'brokerage', label: '證券帳戶', icon: TrendingDown, color: '#3b82f6' },
  { value: 'bank',      label: '銀行帳戶', icon: Landmark,    color: '#10b981' },
  { value: 'insurance', label: '保單',     icon: Shield,      color: '#8b5cf6' },
  { value: 'real_estate', label: '不動產', icon: Building2,   color: '#f59e0b' },
  { value: 'crypto',    label: '加密貨幣', icon: Wallet,      color: '#ec4899' },
  { value: 'debt',      label: '負債',     icon: TrendingDown,color: '#ef4444' },
]

const CURRENCIES = ['TWD', 'USD', 'JPY']

function typeInfo(type) {
  return ACCOUNT_TYPES.find(t => t.value === type) || ACCOUNT_TYPES[0]
}

function AddAccountModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', type: 'brokerage', currency: 'TWD', broker: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('accounts').insert({
      user_id: user.id, name: form.name.trim(),
      type: form.type, currency: form.currency,
      broker: form.broker.trim() || null,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:430, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>新增帳戶</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <p className="label" style={{ marginBottom:6 }}>帳戶名稱</p>
            <input className="input" placeholder="例：元大證券、台新銀行" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div>
            <p className="label" style={{ marginBottom:6 }}>類型</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {ACCOUNT_TYPES.map(({ value, label, icon: Icon, color }) => (
                <button key={value} onClick={() => set('type', value)} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                  padding:'10px 8px', borderRadius:'var(--radius-md)',
                  background: form.type === value ? 'rgba(59,130,246,0.12)' : 'var(--bg-input)',
                  border: form.type === value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  cursor:'pointer', transition:'all 0.15s',
                }}>
                  <Icon size={18} color={form.type === value ? color : 'var(--text-muted)'} />
                  <span style={{ fontSize:11, color: form.type === value ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: form.type === value ? 500 : 400 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>幣別</p>
              <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>券商（選填）</p>
              <input className="input" placeholder="例：Firstrade" value={form.broker} onChange={e => set('broker', e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary" style={{ width:'100%', marginTop:4 }} onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? '儲存中...' : '新增帳戶'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAssetModal({ accountId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', symbol: '', market: 'TW', asset_type: 'stock', quantity: '', avg_cost: '', current_price: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const ASSET_TYPES = [
    { value: 'stock', label: '股票' }, { value: 'etf', label: 'ETF' },
    { value: 'fund', label: '基金' }, { value: 'crypto', label: '加密幣' },
    { value: 'cash', label: '現金' },
  ]
  const MARKETS = [
    { value: 'TW', label: '台股' }, { value: 'US', label: '美股' },
    { value: 'JP', label: '日股' }, { value: 'CRYPTO', label: '加密' },
    { value: 'FUND', label: '基金' },
  ]

  async function save() {
    if (!form.name.trim() || !form.quantity) return
    setSaving(true)
    const { error } = await supabase.from('holdings').insert({
      account_id: accountId,
      symbol: form.symbol.trim().toUpperCase() || form.name.trim(),
      name: form.name.trim(),
      market: form.market,
      asset_type: form.asset_type,
      quantity: Number(form.quantity),
      avg_cost: Number(form.avg_cost) || 0,
      current_price: Number(form.current_price) || Number(form.avg_cost) || 0,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  const isCash = form.asset_type === 'cash'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:430, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', border:'1px solid var(--border)', maxHeight:'90vh', overflowY:'auto' }}>
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
                  background: form.asset_type === value ? 'var(--accent-blue)' : 'var(--bg-input)',
                  color: form.asset_type === value ? 'white' : 'var(--text-secondary)',
                  border: form.asset_type === value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  transition:'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {!isCash && (
            <div>
              <p className="label" style={{ marginBottom:6 }}>市場</p>
              <div style={{ display:'flex', gap:6 }}>
                {MARKETS.map(({ value, label }) => (
                  <button key={value} onClick={() => set('market', value)} style={{
                    padding:'6px 12px', borderRadius:20, fontSize:13, cursor:'pointer',
                    background: form.market === value ? 'rgba(59,130,246,0.15)' : 'var(--bg-input)',
                    color: form.market === value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: form.market === value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                    transition:'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns: isCash ? '1fr' : '1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>名稱</p>
              <input className="input" placeholder={isCash ? '例：台幣現金' : '例：元大台灣50'} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            {!isCash && (
              <div>
                <p className="label" style={{ marginBottom:6 }}>代號</p>
                <input className="input" placeholder="例：0050" value={form.symbol} onChange={e => set('symbol', e.target.value)} />
              </div>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns: isCash ? '1fr' : '1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>{isCash ? '金額' : '數量（股/單位）'}</p>
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
              <p className="label" style={{ marginBottom:6 }}>現價（選填，可之後同步）</p>
              <input className="input" type="number" placeholder={form.avg_cost || '0'} value={form.current_price} onChange={e => set('current_price', e.target.value)} />
            </div>
          )}

          <button className="btn btn-primary" style={{ width:'100%', marginTop:4 }} onClick={save} disabled={saving || !form.name.trim() || !form.quantity}>
            {saving ? '儲存中...' : '新增持倉'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Assets() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [addAssetFor, setAddAssetFor] = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('accounts')
      .select('*, holdings(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at')
    setAccounts(data || [])
    setLoading(false)
  }

  function accountTotal(account) {
    return (account.holdings || []).reduce((sum, h) => {
      if (h.asset_type === 'cash') return sum + Number(h.quantity)
      return sum + Number(h.current_price) * Number(h.quantity)
    }, 0)
  }

  function totalNetAssets() {
    const pos = accounts.filter(a => a.type !== 'debt').reduce((s, a) => s + accountTotal(a), 0)
    const neg = accounts.filter(a => a.type === 'debt').reduce((s, a) => s + accountTotal(a), 0)
    return pos - neg
  }

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div className="page fade-in">
      <PageHeader
        title="資產"
        subtitle={`淨資產 NT$ ${formatNTD(totalNetAssets())}`}
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
      ) : accounts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
          <p style={{ fontSize:14 }}>尚無帳戶</p>
          <p style={{ fontSize:12, marginTop:4 }}>點右上角新增第一個帳戶</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {accounts.map(acc => {
            const { icon: Icon, color } = typeInfo(acc.type)
            const total = accountTotal(acc)
            const isDebt = acc.type === 'debt'
            const isOpen = expanded[acc.id]

            return (
              <div key={acc.id} className="card" style={{ padding:0, overflow:'hidden' }}>
                <button onClick={() => toggle(acc.id)} style={{
                  display:'flex', alignItems:'center', gap:12, width:'100%',
                  padding:'14px 16px', background:'transparent', border:'none',
                  cursor:'pointer', textAlign:'left',
                }}>
                  <div style={{ width:36, height:36, borderRadius:'var(--radius-sm)', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon size={18} color={color} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>{acc.name}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{acc.broker || typeInfo(acc.type).label} · {acc.currency}</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p className="text-mono" style={{ fontSize:15, fontWeight:500, color: isDebt ? 'var(--loss)' : 'var(--text-primary)' }}>
                      {isDebt ? '-' : ''}NT$ {formatNTD(total)}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{(acc.holdings||[]).length} 項</p>
                  </div>
                  <ChevronRight size={16} color="var(--text-muted)" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.2s', flexShrink:0 }} />
                </button>

                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)' }}>
                    {(acc.holdings || []).map(h => (
                      <div key={h.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                        <div>
                          <p style={{ fontSize:13, fontWeight:500 }}>{h.name || h.symbol}</p>
                          <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                            {h.asset_type === 'cash' ? `NT$ ${formatNTD(h.quantity)}` : `${h.quantity} 股 · 均價 ${formatNTD(h.avg_cost)}`}
                          </p>
                        </div>
                        {h.asset_type !== 'cash' && (
                          <div style={{ textAlign:'right' }}>
                            <p style={{ fontSize:13, fontWeight:500 }}>NT$ {formatNTD(Number(h.current_price) * Number(h.quantity))}</p>
                            <p style={{ fontSize:11, color: Number(h.current_price) >= Number(h.avg_cost) ? 'var(--profit)' : 'var(--loss)' }}>
                              {((Number(h.current_price) - Number(h.avg_cost)) / Number(h.avg_cost) * 100).toFixed(2)}%
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setAddAssetFor(acc.id)}
                      style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'12px 16px', background:'transparent', border:'none', cursor:'pointer', color:'var(--accent-blue)', fontSize:13, fontWeight:500 }}>
                      <Plus size={15} /> 新增持倉 / 現金
                    </button>
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
