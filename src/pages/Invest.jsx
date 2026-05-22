import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw, X, ArrowUpRight, ArrowDownRight, DollarSign, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD, formatPct, formatPctColor, formatDate, formatPrice } from '../lib/format'
import { fetchQuotes, lookupSymbol } from '../lib/quote'
import { getRates } from '../lib/fx'
import PageHeader from '../components/layout/PageHeader'

const TABS = ['持倉', '交易', '損益']
const MARKETS = ['全部', 'TW', 'US', 'JP', 'CRYPTO', 'FUND']
const MARKET_LABELS = { 全部:'全部', TW:'台股', US:'美股', JP:'日股', CRYPTO:'加密', FUND:'基金' }
const SORT_OPTIONS = ['市值', '損益', '報酬率', '代號']
const ACCOUNT_TYPE_LABELS = {
  brokerage:'證券帳戶', bank:'銀行帳戶', fund:'基金帳戶',
  insurance:'保單', real_estate:'不動產', crypto:'加密貨幣', debt:'負債',
}
const ASSET_TYPES = [
  { value:'stock', label:'股票' }, { value:'etf', label:'ETF' },
  { value:'fund', label:'基金' }, { value:'crypto', label:'加密幣' },
]

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', background:'var(--bg-input)', borderRadius:10, padding:3, marginBottom:16 }}>
      {tabs.map(t=>(
        <button key={t} onClick={()=>onChange(t)} style={{
          flex:1, padding:'7px 0', borderRadius:8, border:'none', cursor:'pointer',
          fontSize:13, fontWeight:active===t?600:400,
          background:active===t?'var(--bg-card)':'transparent',
          color:active===t?'var(--text-primary)':'var(--text-muted)',
          transition:'all 0.15s',
        }}>{t}</button>
      ))}
    </div>
  )
}

// ── 共用：代號自動查詢 hook ─────────────────────────────────
function useSymbolLookup(symbol, market, onResult) {
  const timer = useRef(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')

  // symbol 清空時自動清除 error
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
        setError('') // 成功時再清一次，防止 race condition
        onResult(result)
      } else if (sym.trim().length >= 2) {
        setError('查無此代號，可手動填入名稱')
      }
    }, 800)
  }

  return { looking, error, trigger }
}

// ── 新增持倉 Modal ──────────────────────────────────────────
function AddHoldingModal({ accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    asset_type:'stock', account_id:accounts[0]?.id||'',
    symbol:'', name:'', market:'TW', quantity:'', total_cost:'',
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const { looking, error, trigger } = useSymbolLookup(form.symbol, form.market, r => set('name', r.name))

  const avgCost = (form.quantity && form.total_cost && Number(form.quantity) > 0)
    ? Number(form.total_cost) / Number(form.quantity) : null

  async function save() {
    if (!form.symbol||!form.quantity||!form.total_cost) return
    setSaving(true)
    await supabase.from('holdings').insert({
      account_id: form.account_id,
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim() || form.symbol.trim().toUpperCase(),
      market: form.market, asset_type: form.asset_type,
      quantity: Number(form.quantity), avg_cost: avgCost||0, current_price: avgCost||0,
    })
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:480, background:'var(--bg-surface)',
        borderRadius:'24px 24px 0 0', border:'1px solid var(--border)',
        maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>新增持倉</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{ overflowY:'scroll', WebkitOverflowScrolling:'touch',
          flex:'1 1 0', minHeight:0, padding:'16px 20px 24px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <p className="label" style={{ marginBottom:5 }}>資產類型</p>
            <select className="input" value={form.asset_type} onChange={e=>set('asset_type',e.target.value)}>
              {ASSET_TYPES.map(({value,label})=><option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <p className="label" style={{ marginBottom:5 }}>帳戶</p>
            <select className="input" value={form.account_id} onChange={e=>set('account_id',e.target.value)}>
              {accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.type?` · ${ACCOUNT_TYPE_LABELS[a.type]||a.type}`:''}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:5 }}>市場</p>
              <select className="input" value={form.market} onChange={e=>{ set('market',e.target.value); trigger(form.symbol, e.target.value) }}>
                {['TW','US','JP','CRYPTO','FUND'].map(m=><option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <p className="label" style={{ marginBottom:5 }}>代號 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <div style={{ position:'relative' }}>
                <input className="input" placeholder="例：0050" value={form.symbol}
                  onChange={e=>{ set('symbol',e.target.value); trigger(e.target.value, form.market) }}
                  style={{ paddingRight: looking ? 36 : 14 }} autoFocus />
                {looking && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}>
                  <RefreshCw size={14} color="var(--accent-blue)" style={{ animation:'spin 1s linear infinite' }}/>
                </div>}
              </div>
            </div>
          </div>
          <div>
            <p className="label" style={{ marginBottom:5 }}>
              名稱
              {looking && <span style={{ color:'var(--accent-blue)', marginLeft:6, fontSize:10 }}>查詢中...</span>}
              {!looking && form.name && <span style={{ color:'var(--profit)', marginLeft:6, fontSize:10 }}>✓ 已自動帶入</span>}
            </p>
            <input className="input" placeholder="例：元大台灣50" value={form.name} onChange={e=>set('name',e.target.value)} />
            {error && <p style={{ fontSize:11, color:'var(--accent-amber)', marginTop:4 }}>{error}</p>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:5 }}>股數 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <input className="input" type="number" placeholder="0" step="0.00001" value={form.quantity} onChange={e=>set('quantity',e.target.value)} />
            </div>
            <div>
              <p className="label" style={{ marginBottom:5 }}>總成本 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
              <input className="input" type="number" placeholder="0" value={form.total_cost} onChange={e=>set('total_cost',e.target.value)} />
            </div>
          </div>
          <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'var(--text-secondary)' }}>均價（自動計算）</span>
            <span className="text-mono" style={{ fontSize:15, fontWeight:600, color:avgCost?'var(--text-primary)':'var(--text-muted)' }}>
              {avgCost ? formatPrice(avgCost) : '—'}
            </span>
          </div>
        </div>
        </div>
        {/* 固定底部按鈕 */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn btn-primary" style={{ width:'100%' }}
            onClick={save} disabled={saving||!form.symbol||!form.quantity||!form.total_cost}>
            {saving?'儲存中...':'新增持倉'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 編輯持倉 Modal（股數＋總成本，自動算均價）──────────────
function EditHoldingModal({ holding, onClose, onSaved }) {
  const [form, setForm] = useState({
    quantity: String(holding.quantity),
    total_cost: String(Math.round(Number(holding.quantity) * Number(holding.avg_cost))),
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

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
    if (!confirm(`確定刪除 ${holding.symbol} 持倉？`)) return
    setSaving(true)
    await supabase.from('holdings').delete().eq('id', holding.id)
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:360, background:'var(--bg-surface)', borderRadius:'var(--radius-xl)', padding:'24px 20px 28px', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:600 }}>{holding.symbol}</h2>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{holding.name}</p>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p className="label" style={{ marginBottom:6 }}>股數</p>
              <input className="input" type="number" step="0.00001" value={form.quantity} onChange={e=>set('quantity',e.target.value)} autoFocus />
            </div>
            <div>
              <p className="label" style={{ marginBottom:6 }}>總成本</p>
              <input className="input" type="number" step="0.01" value={form.total_cost} onChange={e=>set('total_cost',e.target.value)} />
            </div>
          </div>
          <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, color:'var(--text-secondary)' }}>均價（自動計算）</span>
            <span className="text-mono" style={{ fontSize:13, fontWeight:600, color:avgCost?'var(--text-primary)':'var(--text-muted)' }}>
              {avgCost ? formatPrice(avgCost) : '—'}
            </span>
          </div>
          <button className="btn btn-primary" style={{ width:'100%' }} onClick={save} disabled={saving||!form.quantity||!form.total_cost}>
            {saving?'儲存中...':'儲存變更'}
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

// ── 新增/編輯交易 Modal ──────────────────────────────────────
function TransactionModal({ accounts, transaction, onClose, onSaved }) {
  const isEdit = !!transaction
  const [form, setForm] = useState({
    account_id: transaction?.account_id || accounts[0]?.id || '',
    type: transaction?.type || 'buy',
    symbol: transaction?.symbol || '',
    name: transaction?.name || '',
    market: transaction?.market || 'TW',
    quantity: transaction ? String(transaction.quantity) : '',
    total_cost: transaction ? String((Number(transaction.quantity) * Number(transaction.price)).toFixed(2)) : '',
    trade_date: transaction?.trade_date || new Date().toISOString().slice(0,10),
    note: transaction?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const { looking, error, trigger } = useSymbolLookup(form.symbol, form.market, r => set('name', r.name))

  // 單位價格 = 總成本 / 股數
  const unitPrice = (form.quantity && form.total_cost && Number(form.quantity) > 0)
    ? Number(form.total_cost) / Number(form.quantity) : null

  async function save() {
    if (!form.symbol||!form.quantity||!form.total_cost) return
    setSaving(true)

    const newQty  = Number(form.quantity)
    const newCost = Number(form.total_cost)
    const price   = newQty > 0 ? newCost / newQty : 0

    const txData = {
      account_id: form.account_id, type: form.type,
      symbol: form.symbol.trim().toUpperCase(), market: form.market,
      quantity: newQty, price: price,
      fee: 0, tax: 0,
      trade_date: form.trade_date, note: form.note.trim()||null,
    }

    if (isEdit) {
      await supabase.from('transactions').update(txData).eq('id', transaction.id)
    } else {
      await supabase.from('transactions').insert(txData)

      // ── 同步持倉 ──
      if (form.type === 'buy') {
        const sym = form.symbol.trim().toUpperCase()

        // 查同帳戶同代號的既有持倉
        const { data: existing } = await supabase.from('holdings')
          .select('*').eq('account_id', form.account_id).eq('symbol', sym).maybeSingle()

        if (existing) {
          // 合併：加總股數，重算均價
          const totalQty  = Number(existing.quantity) + newQty
          const totalCost = Number(existing.quantity) * Number(existing.avg_cost) + newCost
          const newAvg = totalCost / totalQty
          await supabase.from('holdings').update({
            quantity: totalQty,
            avg_cost: newAvg,
          }).eq('id', existing.id)
        } else {
          // 新增持倉
          const avg = newCost / newQty
          await supabase.from('holdings').insert({
            account_id: form.account_id,
            symbol: sym,
            name: form.name.trim() || sym,
            market: form.market,
            asset_type: 'stock',
            quantity: newQty,
            avg_cost: avg,
            current_price: avg,
          })
        }
      }
    }

    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:480, background:'var(--bg-surface)',
        borderRadius:'24px 24px 0 0', border:'1px solid var(--border)',
        maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* 固定標題 */}
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h2 style={{ fontSize:18, fontWeight:600 }}>{isEdit ? '編輯交易' : '新增交易'}</h2>
            <button className="btn btn-icon" onClick={onClose}><X size={16}/></button>
          </div>
          <div style={{ display:'flex', background:'var(--bg-input)', borderRadius:10, padding:3 }}>
            {['buy','sell'].map(t=>(
              <button key={t} onClick={()=>set('type',t)} style={{
                flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:14, fontWeight:500,
                background:form.type===t?(t==='buy'?'var(--profit)':'var(--loss)'):'transparent',
                color:form.type===t?'white':'var(--text-muted)', transition:'all 0.15s',
              }}>{t==='buy'?'買入':'賣出'}</button>
            ))}
          </div>
        </div>

        {/* 可滾動內容 */}
        <div style={{ overflowY:'scroll', WebkitOverflowScrolling:'touch',
          flex:'1 1 0', minHeight:0, padding:'16px 20px 24px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            <div>
              <p className="label" style={{ marginBottom:5 }}>帳戶</p>
              <select className="input" value={form.account_id} onChange={e=>set('account_id',e.target.value)}>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.type?` · ${ACCOUNT_TYPE_LABELS[a.type]||a.type}`:''}</option>)}
              </select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="label" style={{ marginBottom:5 }}>市場</p>
                <select className="input" value={form.market} onChange={e=>{ set('market',e.target.value); trigger(form.symbol, e.target.value) }}>
                  {['TW','US','JP','CRYPTO','FUND'].map(m=><option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
                </select>
              </div>
              <div>
                <p className="label" style={{ marginBottom:5 }}>代號 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
                <div style={{ position:'relative' }}>
                  <input className="input" placeholder="例：0050" value={form.symbol}
                    onChange={e=>{ set('symbol',e.target.value); trigger(e.target.value, form.market) }}
                    style={{ paddingRight: looking ? 36 : 14 }} autoFocus={!isEdit} />
                  {looking && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}>
                    <RefreshCw size={14} color="var(--accent-blue)" style={{ animation:'spin 1s linear infinite' }}/>
                  </div>}
                </div>
              </div>
            </div>

            <div>
              <p className="label" style={{ marginBottom:5 }}>
                名稱
                {looking && <span style={{ color:'var(--accent-blue)', marginLeft:6, fontSize:10 }}>查詢中...</span>}
                {!looking && form.name && <span style={{ color:'var(--profit)', marginLeft:6, fontSize:10 }}>✓ 已帶入</span>}
              </p>
              <input className="input" placeholder="例：元大台灣50" value={form.name} onChange={e=>set('name',e.target.value)} />
              {error && <p style={{ fontSize:11, color:'var(--accent-amber)', marginTop:4 }}>{error}</p>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <p className="label" style={{ marginBottom:5 }}>股數 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
                <input className="input" type="number" placeholder="0" step="0.00001" value={form.quantity} onChange={e=>set('quantity',e.target.value)} />
              </div>
              <div>
                <p className="label" style={{ marginBottom:5 }}>總成本 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
                <input className="input" type="number" placeholder="0" value={form.total_cost} onChange={e=>set('total_cost',e.target.value)} />
              </div>
            </div>

            <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, color:'var(--text-secondary)' }}>單位價格（自動計算）</span>
              <span className="text-mono" style={{ fontSize:13, fontWeight:600, color:unitPrice?'var(--text-primary)':'var(--text-muted)' }}>
                {unitPrice ? formatPrice(unitPrice) : '—'}
              </span>
            </div>

            <div>
              <p className="label" style={{ marginBottom:5 }}>交易日期</p>
              <input className="input" type="text" placeholder="YYYY-MM-DD"
                value={form.trade_date} onChange={e=>set('trade_date',e.target.value)} />
            </div>

            <div>
              <p className="label" style={{ marginBottom:5 }}>備註（選填）</p>
              <input className="input" placeholder="交易原因" value={form.note} onChange={e=>set('note',e.target.value)} />
            </div>

            {!isEdit && form.type==='buy' && (
              <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                買入交易將自動同步至持倉（相同代號自動合併）
              </p>
            )}
          </div>
        </div>
        {/* 固定底部按鈕 */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn btn-primary" style={{ width:'100%' }}
            onClick={save} disabled={saving||!form.symbol||!form.quantity||!form.total_cost}>
            {saving?'儲存中...':isEdit?'儲存變更':'新增交易'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 新增損益 Modal（賣出 / 股利 兩分頁）─────────────────────
function AddPnlModal({ accounts, onClose, onSaved }) {
  const [type, setType] = useState('sell_profit')
  const [saving, setSaving] = useState(false)

  // ── 賣出表單 ──
  const [sell, setSell] = useState({
    record_date: new Date().toISOString().slice(0,10),
    account_id: accounts[0]?.id || '',
    market: 'TW', symbol: '', name: '',
    quantity: '', total_cost: '', sell_amount: '',
  })
  const setSellF = (k, v) => setSell(f => ({ ...f, [k]: v }))

  const { looking: sellLooking, error: sellError, trigger: sellTrigger } =
    useSymbolLookup(sell.symbol, sell.market, r => setSellF('name', r.name))

  const sellProfit = (sell.sell_amount !== '' && sell.total_cost !== '')
    ? Number(sell.sell_amount) - Number(sell.total_cost) : null
  const sellPct = (sellProfit !== null && Number(sell.total_cost) > 0)
    ? (sellProfit / Number(sell.total_cost) * 100) : null

  // ── 股利表單 ──
  const [div, setDiv] = useState({
    record_date: new Date().toISOString().slice(0,10),
    account_id: accounts[0]?.id || '',
    market: 'TW', symbol: '', name: '', amount: '',
  })
  const setDivF = (k, v) => setDiv(f => ({ ...f, [k]: v }))

  const { looking: divLooking, error: divError, trigger: divTrigger } =
    useSymbolLookup(div.symbol, div.market, r => setDivF('name', r.name))

  async function save() {
    setSaving(true)
    if (type === 'sell_profit') {
      if (!sell.sell_amount) { setSaving(false); return }
      const sellQty  = Number(sell.quantity) || 0
      const sellCost = Number(sell.total_cost) || 0

      // ── 寫入損益紀錄 ──
      const { error: pnlErr } = await supabase.from('pnl_records').insert({
        account_id: sell.account_id, type: 'sell_profit',
        symbol: sell.symbol.trim().toUpperCase() || null,
        market: sell.market || null,
        amount: sellProfit ?? 0,
        tax: 0,
        record_date: sell.record_date,
        note: `股數:${sellQty} 成本:${sellCost} 成交:${sell.sell_amount}`,
      })
      if (pnlErr) { console.error('pnl insert error:', pnlErr); setSaving(false); return }

      // ── 自動扣減持倉 ──
      if (sellQty > 0 && sell.symbol.trim()) {
        const sym = sell.symbol.trim().toUpperCase()

        // 先用帳戶+代號查，找不到再用純代號查（防止帳戶選錯）
        let { data: existing, error: qErr } = await supabase
          .from('holdings')
          .select('id, quantity, avg_cost, account_id')
          .eq('account_id', sell.account_id)
          .eq('symbol', sym)
          .maybeSingle()

        // 如果帳戶+代號找不到，嘗試只用代號找（跨帳戶 fallback）
        if (!existing && !qErr) {
          const { data: fallback } = await supabase
            .from('holdings')
            .select('id, quantity, avg_cost, account_id')
            .eq('symbol', sym)
            .maybeSingle()
          existing = fallback
        }

        if (existing) {
          const remainQty = Number(existing.quantity) - sellQty
          if (remainQty <= 0.00001) {
            await supabase.from('holdings').delete().eq('id', existing.id)
          } else {
            await supabase.from('holdings').update({
              quantity: remainQty,
              avg_cost: Number(existing.avg_cost),
            }).eq('id', existing.id)
          }
        }
      }

    } else {
      if (!div.amount) { setSaving(false); return }
      await supabase.from('pnl_records').insert({
        account_id: div.account_id, type: 'dividend',
        symbol: div.symbol.trim().toUpperCase() || null,
        market: div.market || null,
        amount: Number(div.amount), tax: 0,
        record_date: div.record_date, note: null,
      })
    }
    setSaving(false); onSaved()
  }

  const canSave = type === 'sell_profit' ? !!sell.sell_amount : !!div.amount

  // 日期格式轉換：YYYY-MM-DD ↔ YYYY/MM/DD（顯示用 /，input value 用 -）
  function toDisplayDate(iso) { return iso.replace(/-/g, '/') }
  function toIsoDate(display) { return display.replace(/\//g, '-') }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        width:'100%', maxWidth:480,
        background:'var(--bg-surface)',
        borderRadius:'24px 24px 0 0',
        border:'1px solid var(--border)',
        maxHeight:'80vh',
        display:'flex', flexDirection:'column',
        overflow:'hidden',
      }}>

        {/* ── 固定標題區 ── */}
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h2 style={{ fontSize:18, fontWeight:600 }}>新增損益紀錄</h2>
            <button className="btn btn-icon" onClick={onClose}><X size={16}/></button>
          </div>
          <div style={{ display:'flex', background:'var(--bg-input)', borderRadius:10, padding:3 }}>
            {[['sell_profit','賣出'],['dividend','股利']].map(([v,l]) => (
              <button key={v} onClick={() => setType(v)} style={{
                flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:14, fontWeight:500,
                background: type===v ? (v==='sell_profit' ? 'var(--profit)' : 'rgba(59,130,246,0.85)') : 'transparent',
                color: type===v ? 'white' : 'var(--text-muted)', transition:'all 0.15s',
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── 可滾動內容區（iOS 關鍵：flex:'1 1 0' + minHeight:0）── */}
        <div style={{
          overflowY:'scroll',
          WebkitOverflowScrolling:'touch',
          flex:'1 1 0',
          minHeight:0,
          padding:'16px 20px 24px',
        }}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {type === 'sell_profit' ? (
              <>
                <div>
                  <p className="label" style={{ marginBottom:5 }}>日期</p>
                  <input className="input" type="date" value={sell.record_date}
                    onChange={e => setSellF('record_date', e.target.value)} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>帳戶</p>
                    <select className="input" value={sell.account_id} onChange={e => setSellF('account_id', e.target.value)}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>市場</p>
                    <select className="input" value={sell.market}
                      onChange={e => { setSellF('market', e.target.value); sellTrigger(sell.symbol, e.target.value) }}>
                      {['TW','US','JP','CRYPTO','FUND'].map(m => <option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>代號</p>
                    <div style={{ position:'relative' }}>
                      <input className="input" placeholder="例：0050" value={sell.symbol}
                        onChange={e => { setSellF('symbol', e.target.value); sellTrigger(e.target.value, sell.market) }}
                        style={{ paddingRight: sellLooking ? 36 : 14 }} />
                      {sellLooking && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}>
                        <RefreshCw size={13} color="var(--accent-blue)" style={{ animation:'spin 1s linear infinite' }}/>
                      </div>}
                    </div>
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>
                      名稱{!sellLooking && sell.name && <span style={{ color:'var(--profit)', marginLeft:5, fontSize:10 }}>✓</span>}
                    </p>
                    <input className="input" placeholder="自動帶入" value={sell.name}
                      onChange={e => setSellF('name', e.target.value)} />
                  </div>
                </div>
                {sellError && <p style={{ fontSize:11, color:'var(--accent-amber)', marginTop:-4 }}>{sellError}</p>}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  <div>
                    <p className="label" style={{ marginBottom:5, fontSize:11 }}>股數</p>
                    <input className="input" type="number" placeholder="0" step="0.00001"
                      value={sell.quantity} onChange={e => setSellF('quantity', e.target.value)} />
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5, fontSize:11 }}>總成本</p>
                    <input className="input" type="number" placeholder="0"
                      value={sell.total_cost} onChange={e => setSellF('total_cost', e.target.value)} />
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5, fontSize:11 }}>成交價 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
                    <input className="input" type="number" placeholder="0"
                      value={sell.sell_amount} onChange={e => setSellF('sell_amount', e.target.value)} />
                  </div>
                </div>

                <div style={{ background:'var(--bg-input)', borderRadius:'var(--radius-md)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, color:'var(--text-secondary)' }}>獲利（自動計算）</span>
                  <span className="text-mono" style={{ fontSize:14, fontWeight:600,
                    color: sellProfit == null ? 'var(--text-muted)' : sellProfit >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {sellProfit == null ? '—' : (sellProfit >= 0 ? '+' : '') + formatNTD(sellProfit)}
                    {sellPct != null && <span style={{ fontSize:11, marginLeft:6, opacity:0.85 }}>({sellPct >= 0 ? '+' : ''}{sellPct.toFixed(2)}%)</span>}
                  </span>
                </div>

                {sell.quantity && sell.symbol && (
                  <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                    儲存後將自動從持倉扣減 {sell.quantity} 股 {sell.symbol.toUpperCase()}
                  </p>
                )}
              </>
            ) : (
              <>
                <div>
                  <p className="label" style={{ marginBottom:5 }}>日期</p>
                  <input className="input" type="date" value={div.record_date}
                    onChange={e => setDivF('record_date', e.target.value)} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>帳戶</p>
                    <select className="input" value={div.account_id} onChange={e => setDivF('account_id', e.target.value)}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>市場</p>
                    <select className="input" value={div.market}
                      onChange={e => { setDivF('market', e.target.value); divTrigger(div.symbol, e.target.value) }}>
                      {['TW','US','JP','CRYPTO','FUND'].map(m => <option key={m} value={m}>{MARKET_LABELS[m]}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>代號</p>
                    <div style={{ position:'relative' }}>
                      <input className="input" placeholder="例：0050" value={div.symbol}
                        onChange={e => { setDivF('symbol', e.target.value); divTrigger(e.target.value, div.market) }}
                        style={{ paddingRight: divLooking ? 36 : 14 }} />
                      {divLooking && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}>
                        <RefreshCw size={13} color="var(--accent-blue)" style={{ animation:'spin 1s linear infinite' }}/>
                      </div>}
                    </div>
                  </div>
                  <div>
                    <p className="label" style={{ marginBottom:5 }}>
                      名稱{!divLooking && div.name && <span style={{ color:'var(--profit)', marginLeft:5, fontSize:10 }}>✓</span>}
                    </p>
                    <input className="input" placeholder="自動帶入" value={div.name}
                      onChange={e => setDivF('name', e.target.value)} />
                  </div>
                </div>
                {divError && <p style={{ fontSize:11, color:'var(--accent-amber)', marginTop:-4 }}>{divError}</p>}

                <div>
                  <p className="label" style={{ marginBottom:5 }}>股利金額 <span style={{ color:'var(--accent-blue)' }}>*</span></p>
                  <input className="input" type="number" placeholder="0"
                    value={div.amount} onChange={e => setDivF('amount', e.target.value)} />
                </div>
              </>
            )}

          </div>
        </div>
        {/* 固定底部按鈕 */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn btn-primary" style={{ width:'100%' }}
            onClick={save} disabled={saving || !canSave}>
            {saving ? '儲存中...' : '新增紀錄'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 持倉分頁 ───────────────────────────────────────────────
function HoldingsTab({ accounts, refreshTick, onRefreshDone, usdRate }) {
  const [marketFilter, setMarketFilter] = useState('全部')
  const [accountFilter, setAccountFilter] = useState('全部')
  const [sortBy, setSortBy] = useState('市值')
  const [searchQuery, setSearchQuery] = useState('')
  const [prices, setPrices] = useState({})
  const [quoteStatus, setQuoteStatus] = useState('idle')
  const [editHolding, setEditHolding] = useState(null)
  const [localTick, setLocalTick] = useState(0)

  // 取得幣別匯率（TWD=1，USD=usdRate，其他暫用1）
  function getFxRate(market) {
    if (market === 'US') return usdRate || 1
    return 1
  }

  const allHoldings = accounts.flatMap(acc =>
    (acc.holdings||[]).filter(h=>h.asset_type!=='cash').map(h=>({...h, accountName:acc.name, accountId:acc.id}))
  )

  const loadQuotes = useCallback(async () => {
    if (allHoldings.length === 0) return
    setQuoteStatus('loading')
    const result = await fetchQuotes(allHoldings)
    setPrices(result)
    setQuoteStatus(Object.keys(result).length > 0 ? 'ok' : 'error')

    // 將即時價格寫回 Supabase，讓 Assets 頁也能顯示正確現價與報酬率
    const updates = allHoldings
      .filter(h => result[`${h.market}:${h.symbol}`] != null)
      .map(h => supabase.from('holdings')
        .update({ current_price: result[`${h.market}:${h.symbol}`] })
        .eq('id', h.id)
      )
    if (updates.length > 0) await Promise.all(updates)
  }, [allHoldings.length])

  useEffect(() => { loadQuotes() }, [accounts.length, refreshTick, localTick])

  function getPrice(h) {
    return prices[`${h.market}:${h.symbol}`] || Number(h.current_price) || 0
  }

  const accountOptions = [{ id:'全部', name:'全部' }, ...accounts]
  let filtered = allHoldings
  if (marketFilter !== '全部') filtered = filtered.filter(h => h.market === marketFilter)
  if (accountFilter !== '全部') filtered = filtered.filter(h => h.accountId === accountFilter)
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    filtered = filtered.filter(h =>
      h.symbol.toLowerCase().includes(q) || (h.name||'').toLowerCase().includes(q)
    )
  }

  filtered = filtered.map(h => {
    const price = getPrice(h)
    const fx = getFxRate(h.market)
    const qty = Number(h.quantity), avg = Number(h.avg_cost)
    const marketVal = price * qty * fx   // 換算成 TWD
    const cost = avg * qty * fx          // 換算成 TWD
    const pnl = marketVal - cost
    const pct = cost > 0 ? (pnl/cost)*100 : 0
    return { ...h, price, marketVal, cost, pnl, pct, fx }
  }).sort((a,b) => {
    if (sortBy==='市值') return b.marketVal - a.marketVal
    if (sortBy==='損益') return b.pnl - a.pnl
    if (sortBy==='報酬率') return b.pct - a.pct
    if (sortBy==='代號') return a.symbol.localeCompare(b.symbol)
    return 0
  })

  const totalMarket = filtered.reduce((s,h)=>s+h.marketVal, 0)
  const totalCost   = filtered.reduce((s,h)=>s+h.cost, 0)
  const totalPnl    = totalMarket - totalCost
  const totalPct    = totalCost > 0 ? (totalPnl/totalCost)*100 : 0

  const chip = (active, label, onClick) => (
    <button onClick={onClick} style={{
      padding:'4px 10px', borderRadius:20, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
      background:active?'var(--accent-blue)':'var(--bg-input)',
      color:active?'white':'var(--text-secondary)',
      border:active?'1px solid var(--accent-blue)':'1px solid var(--border)',
    }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>投資市值</p>
          <div className="medium-number">{formatNTD(totalMarket)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>未實現損益</p>
          <div className="medium-number" style={{ color:formatPctColor(totalPnl) }}>{totalPnl>=0?'+':''}{formatNTD(totalPnl)}</div>
          <div style={{ fontSize:12, color:formatPctColor(totalPct) }}>{formatPct(totalPct)}</div>
        </div>
      </div>
      {quoteStatus === 'error' && (
        <div style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'var(--radius-md)', padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--accent-amber)' }}>
          ⚠️ 無法取得即時報價，顯示最後儲存的價格
        </div>
      )}
      <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:2, marginBottom:8 }}>
        {MARKETS.map(m => chip(marketFilter===m, MARKET_LABELS[m], ()=>setMarketFilter(m)))}
      </div>
      {accounts.length > 1 && (
        <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:2, marginBottom:8 }}>
          {accountOptions.map(a => chip(accountFilter===a.id, a.name, ()=>setAccountFilter(a.id)))}
        </div>
      )}
      {/* 搜尋框 */}
      <div style={{ position:'relative', marginBottom:10 }}>
        <input
          className="input"
          placeholder="搜尋代號或名稱…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ paddingLeft:36, fontSize:14, height:38 }}
        />
        <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', opacity:0.4 }}
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{
            position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:16, lineHeight:1,
          }}>×</button>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
        <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>排序</span>
        {SORT_OPTIONS.map(s=>(
          <button key={s} onClick={()=>setSortBy(s)} style={{
            padding:'3px 10px', borderRadius:20, fontSize:11, cursor:'pointer',
            background:sortBy===s?'rgba(59,130,246,0.15)':'transparent',
            color:sortBy===s?'var(--accent-blue)':'var(--text-muted)',
            border:sortBy===s?'1px solid rgba(59,130,246,0.3)':'1px solid transparent',
          }}>{s}</button>
        ))}
      </div>
      {filtered.length===0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>尚無持倉資料</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map(h=>(
            <div key={h.id} className="card-sm" style={{ padding:'10px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ fontSize:14, fontWeight:700, fontFamily:'DM Mono', color:'var(--text-primary)' }}>{h.symbol}</span>
                    <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--bg-input)', padding:'1px 5px', borderRadius:4 }}>{h.market}</span>
                    {quoteStatus==='loading' && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent-blue)', display:'inline-block', animation:'pulse 1s ease-in-out infinite' }}/>}
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {h.name} · {h.accountName}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontSize:13, fontFamily:'DM Mono', fontWeight:600, color:'var(--text-primary)' }}>
                    {h.price > 0 ? (h.market==='US' ? `$${h.price.toFixed(2)}` : formatNTD(h.price)) : '—'}
                  </p>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>
                    {Number(h.quantity).toLocaleString('en-US', {maximumFractionDigits:4})} 股
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, minWidth:58 }}>
                  <p style={{ fontSize:13, fontFamily:'DM Mono', fontWeight:700, color:h.cost>0?formatPctColor(h.pct):'var(--text-muted)' }}>
                    {h.cost>0 ? (h.pct>=0?'+':'')+h.pct.toFixed(2)+'%' : '—'}
                  </p>
                  <p style={{ fontSize:11, color:formatPctColor(h.pnl), fontFamily:'DM Mono', marginTop:1 }}>
                    {h.cost>0 ? (h.pnl>=0?'+':'')+formatNTD(h.pnl) : ''}
                  </p>
                </div>
                <button onClick={()=>setEditHolding(h)} style={{
                  flexShrink:0, width:28, height:28, borderRadius:6,
                  background:'var(--bg-input)', border:'1px solid var(--border)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', color:'var(--text-muted)',
                }}><Edit2 size={12}/></button>
              </div>
              <div style={{ display:'flex', gap:12, marginTop:7, paddingTop:7, borderTop:'1px solid var(--border)' }}>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>均價 <span style={{ color:'var(--text-secondary)', fontFamily:'DM Mono' }}>{h.market==='US' ? `$${Number(h.avg_cost).toFixed(2)}` : formatPrice(h.avg_cost)}</span></span>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>市值 <span style={{ color:'var(--text-secondary)', fontFamily:'DM Mono' }}>NT${formatNTD(h.marketVal)}</span></span>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>成本 <span style={{ color:'var(--text-secondary)', fontFamily:'DM Mono' }}>NT${formatNTD(h.cost)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
      {editHolding && (
        <EditHoldingModal
          holding={editHolding}
          onClose={()=>setEditHolding(null)}
          onSaved={()=>{ setEditHolding(null); setLocalTick(t=>t+1); onRefreshDone() }}
        />
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}

// ── 交易分頁 ───────────────────────────────────────────────
function TransactionsTab({ accounts, onHoldingChanged }) {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTxn, setEditTxn] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const accountMap = Object.fromEntries(accounts.map(a=>[a.id,a.name]))

  useEffect(()=>{ load() }, [])

  async function load() {
    setLoading(true)
    const ids = accounts.map(a=>a.id)
    if (!ids.length) { setLoading(false); return }
    let q = supabase.from('transactions').select('*').in('account_id',ids).order('trade_date',{ascending:false})
    if (dateFrom) q = q.gte('trade_date',dateFrom)
    if (dateTo)   q = q.lte('trade_date',dateTo)
    const { data } = await q
    setTxns(data||[])
    setLoading(false)
  }

  async function deleteTxn(id) {
    if (!confirm('確定刪除此交易紀錄？')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  const totalBuy  = txns.filter(t=>t.type==='buy').reduce((s,t)=>s+Number(t.quantity)*Number(t.price)+Number(t.fee||0),0)
  const totalSell = txns.filter(t=>t.type==='sell').reduce((s,t)=>s+Number(t.quantity)*Number(t.price)-Number(t.fee||0)-Number(t.tax||0),0)

  function exportCSV() {
    const header = '日期,類型,代號,市場,股數,成交價,手續費,稅,帳戶,備註'
    const rows = txns.map(t=>[
      t.trade_date,t.type==='buy'?'買入':'賣出',t.symbol,t.market,
      t.quantity,t.price,t.fee||0,t.tax||0,accountMap[t.account_id]||'',t.note||''
    ].join(','))
    const blob = new Blob([header+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download=`交易紀錄_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>買入總額</p>
          <div className="medium-number">{formatNTD(totalBuy)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>賣出總額</p>
          <div className="medium-number">{formatNTD(totalSell)}</div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        <input className="input" type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="從 YYYY-MM-DD" style={{ fontSize:13, padding:'8px 12px' }} />
        <input className="input" type="text" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   placeholder="至 YYYY-MM-DD" style={{ fontSize:13, padding:'8px 12px' }} />
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <button className="btn btn-ghost" style={{ flex:1, fontSize:13, padding:'8px' }} onClick={load}>篩選</button>
        <button className="btn btn-ghost" style={{ fontSize:13, padding:'8px 12px' }} onClick={exportCSV}>CSV</button>
        <button className="btn btn-primary" style={{ fontSize:13, padding:'8px 14px' }} onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> 新增
        </button>
      </div>
      {loading
        ? [1,2,3].map(i=><div key={i} className="skeleton" style={{ height:68, borderRadius:'var(--radius-md)', marginBottom:8 }}/>)
        : txns.length===0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>尚無交易紀錄</div>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {txns.map(t=>(
                <div key={t.id} className="card-sm" style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:t.type==='buy'?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)' }}>
                    {t.type==='buy'?<ArrowUpRight size={16} color="var(--profit)"/>:<ArrowDownRight size={16} color="var(--loss)"/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:14, fontWeight:700, fontFamily:'DM Mono' }}>{t.symbol}</span>
                      <span className={`badge ${t.type==='buy'?'badge-profit':'badge-loss'}`} style={{ fontSize:10 }}>{t.type==='buy'?'買入':'賣出'}</span>
                      <span style={{ fontSize:10, color:'var(--text-muted)' }}>{t.market}</span>
                    </div>
                    <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{formatDate(t.trade_date)} · {accountMap[t.account_id]||''}</p>
                    {t.note && <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:1 }}>{t.note}</p>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p className="text-mono" style={{ fontSize:13, fontWeight:500 }}>{formatNTD(Number(t.quantity)*Number(t.price))}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>{Number(t.quantity).toLocaleString()} 股 · @{formatNTD(t.price)}</p>
                  </div>
                  {/* 編輯/刪除 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                    <button onClick={()=>setEditTxn(t)} style={{ width:26, height:26, borderRadius:6, background:'var(--bg-input)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-muted)' }}>
                      <Edit2 size={11}/>
                    </button>
                    <button onClick={()=>deleteTxn(t.id)} style={{ width:26, height:26, borderRadius:6, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--loss)' }}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
      }
      {showAdd && (
        <TransactionModal accounts={accounts} onClose={()=>setShowAdd(false)}
          onSaved={()=>{ setShowAdd(false); load(); onHoldingChanged() }} />
      )}
      {editTxn && (
        <TransactionModal accounts={accounts} transaction={editTxn} onClose={()=>setEditTxn(null)}
          onSaved={()=>{ setEditTxn(null); load() }} />
      )}
    </div>
  )
}

// ── 損益分頁 ───────────────────────────────────────────────
function PnlTab({ accounts, onHoldingChanged }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pnlView, setPnlView] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const accountMap = Object.fromEntries(accounts.map(a=>[a.id,a.name]))
  const TYPE_LABELS = { dividend:'股利', sell_profit:'賣出損益', interest:'利息', other:'其他' }

  useEffect(()=>{ load() }, [])

  async function load() {
    setLoading(true)
    const ids = accounts.map(a=>a.id)
    if (!ids.length) { setLoading(false); return }
    let q = supabase.from('pnl_records').select('*').in('account_id',ids).order('record_date',{ascending:false})
    if (dateFrom) q = q.gte('record_date',dateFrom)
    if (dateTo)   q = q.lte('record_date',dateTo)
    const { data } = await q
    setRecords(data||[])
    setLoading(false)
  }

  async function deletePnl(r) {
    if (!confirm(`確定刪除此${TYPE_LABELS[r.type]||''}紀錄？`)) return
    await supabase.from('pnl_records').delete().eq('id', r.id)
    load()
  }

  const filtered = pnlView==='all' ? records
    : pnlView==='dividend' ? records.filter(r=>r.type==='dividend'||r.type==='interest')
    : records.filter(r=>r.type==='sell_profit')

  const totalDividend = records.filter(r=>r.type==='dividend'||r.type==='interest').reduce((s,r)=>s+Number(r.amount),0)
  const totalSellPnl  = records.filter(r=>r.type==='sell_profit').reduce((s,r)=>s+Number(r.amount),0)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>股利</p>
          <div className="medium-number" style={{ color:'var(--profit)' }}>+{formatNTD(totalDividend)}</div>
        </div>
        <div className="card-sm">
          <p className="label" style={{ marginBottom:4 }}>賣出損益</p>
          <div className="medium-number" style={{ color:formatPctColor(totalSellPnl) }}>
            {totalSellPnl>=0?'+':''}{formatNTD(totalSellPnl)}
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        <input className="input" type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="從 YYYY-MM-DD" style={{ fontSize:13, padding:'8px 12px' }} />
        <input className="input" type="text" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   placeholder="至 YYYY-MM-DD" style={{ fontSize:13, padding:'8px 12px' }} />
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button className="btn btn-ghost" style={{ flex:1, fontSize:13, padding:'8px' }} onClick={load}>篩選</button>
        <button className="btn btn-primary" style={{ fontSize:13, padding:'8px 14px' }} onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> 新增
        </button>
      </div>
      {/* 篩選 tag：只保留全部 / 股利 / 賣出 */}
      <div style={{ display:'flex', gap:6, marginBottom:14 }}>
        {[['all','全部'],['dividend','股利'],['sell','賣出']].map(([v,l])=>(
          <button key={v} onClick={()=>setPnlView(v)} style={{
            padding:'5px 12px', borderRadius:20, fontSize:12, cursor:'pointer',
            background:pnlView===v?'var(--accent-blue)':'var(--bg-input)',
            color:pnlView===v?'white':'var(--text-secondary)',
            border:pnlView===v?'1px solid var(--accent-blue)':'1px solid var(--border)',
          }}>{l}</button>
        ))}
      </div>
      {loading
        ? [1,2,3].map(i=><div key={i} className="skeleton" style={{ height:60, borderRadius:'var(--radius-md)', marginBottom:8 }}/>)
        : filtered.length===0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>尚無損益紀錄</div>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {filtered.map(r=>{
                const isSell = r.type === 'sell_profit'
                const amt = Number(r.amount)
                // 從 note 解析賣出時記錄的成本
                const noteMatch = r.note?.match(/成本:(\S+)/)
                const costStr = noteMatch ? noteMatch[1] : null
                const costVal = costStr ? Number(costStr) : null
                const pct = costVal && costVal > 0 ? (amt / costVal * 100) : null
                return (
                  <div key={r.id} className="card-sm" style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                      background: isSell ? (amt>=0?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)') : 'rgba(59,130,246,0.12)' }}>
                      <DollarSign size={16} color={isSell ? (amt>=0?'var(--profit)':'var(--loss)') : 'var(--accent-blue)'}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:600, fontFamily:'DM Mono' }}>{r.symbol||'—'}</span>
                        <span className="badge badge-neutral" style={{ fontSize:10 }}>{TYPE_LABELS[r.type]}</span>
                      </div>
                      <p style={{ fontSize:11, color:'var(--text-muted)' }}>{formatDate(r.record_date)} · {accountMap[r.account_id]||''}</p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p className="text-mono" style={{ fontSize:14, fontWeight:600, color: isSell ? formatPctColor(amt) : 'var(--accent-blue)' }}>
                        {amt>=0?'+':''}{formatNTD(amt)}
                      </p>
                      {pct != null && (
                        <p style={{ fontSize:11, color:formatPctColor(pct) }}>
                          {pct>=0?'+':''}{pct.toFixed(2)}%
                        </p>
                      )}
                    </div>
                    <button onClick={()=>deletePnl(r)} style={{ flexShrink:0, width:26, height:26, borderRadius:6, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--loss)' }}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                )
              })}
            </div>
          )
      }
      {showAdd && <AddPnlModal accounts={accounts} onClose={()=>setShowAdd(false)} onSaved={()=>{setShowAdd(false);load();onHoldingChanged?.()}}/>}
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function Invest() {
  const [tab, setTab] = useState('持倉')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [usdRate, setUsdRate] = useState(1)

  async function loadAccounts() {
    const { data:{user} } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('accounts').select('*, holdings(*)')
      .eq('user_id',user.id).eq('is_active',true).neq('type','debt')
    setAccounts(data||[])
    setLoading(false)
  }

  async function loadUsdRate() {
    try {
      const r = await getRates(['USD'])
      if (r?.USD) setUsdRate(r.USD)
    } catch { /* 保持預設值 */ }
  }

  useEffect(()=>{ loadAccounts() }, [refreshTick])
  useEffect(()=>{ loadUsdRate() }, [])

  async function handleRefresh() {
    setQuoteLoading(true)
    setRefreshTick(t=>t+1)
    await new Promise(r=>setTimeout(r,1500))
    setLastUpdated(new Date())
    setQuoteLoading(false)
  }

  return (
    <div className="page fade-in">
      <PageHeader
        title="投資"
        action={
          tab==='持倉' ? (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {lastUpdated && <span style={{ fontSize:10, color:'var(--text-muted)' }}>{lastUpdated.toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</span>}
              <button className="btn btn-icon" onClick={handleRefresh} style={{ opacity:quoteLoading?0.5:1 }}>
                <RefreshCw size={14} style={{ animation:quoteLoading?'spin 1s linear infinite':undefined }}/>
              </button>
              <button className="btn btn-primary" style={{ padding:'7px 12px', fontSize:12 }} onClick={()=>setShowAddHolding(true)}>
                <Plus size={14}/> 新增持倉
              </button>
            </div>
          ) : null
        }
      />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {loading
        ? [1,2,3].map(i=><div key={i} className="skeleton" style={{ height:68, borderRadius:'var(--radius-md)', marginBottom:8 }}/>)
        : (
          <>
            {tab==='持倉' && <HoldingsTab accounts={accounts} refreshTick={refreshTick} onRefreshDone={()=>setRefreshTick(t=>t+1)} usdRate={usdRate}/>}
            {tab==='交易' && <TransactionsTab accounts={accounts} onHoldingChanged={()=>setRefreshTick(t=>t+1)}/>}
            {tab==='損益' && <PnlTab accounts={accounts} onHoldingChanged={()=>setRefreshTick(t=>t+1)}/>}
          </>
        )
      }
      {showAddHolding && (
        <AddHoldingModal accounts={accounts} onClose={()=>setShowAddHolding(false)}
          onSaved={()=>{ setShowAddHolding(false); setRefreshTick(t=>t+1) }} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
