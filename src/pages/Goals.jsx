import { useState, useEffect } from 'react'
import { Plus, X, Edit2, Target, Calendar, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNTD, formatPct, formatPctColor } from '../lib/format'
import PageHeader from '../components/layout/PageHeader'

function GoalModal({ goal, onClose, onSaved }) {
  const isEdit = !!goal
  const [form, setForm] = useState({
    name: goal?.name || 'FIRE 目標',
    target_amount: goal?.target_amount || '',
    target_date: goal?.target_date || '',
    note: goal?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.target_amount) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      user_id: user.id,
      name: form.name.trim() || 'FIRE 目標',
      target_amount: Number(form.target_amount),
      target_date: form.target_date || null,
      note: form.note.trim() || null,
    }
    if (isEdit) {
      await supabase.from('goals').update(payload).eq('id', goal.id)
    } else {
      await supabase.from('goals').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 430, background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{isEdit ? '編輯目標' : '新增目標'}</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p className="label" style={{ marginBottom: 6 }}>目標名稱</p>
            <input className="input" placeholder="FIRE 目標" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <p className="label" style={{ marginBottom: 6 }}>目標金額（TWD）</p>
            <input className="input" type="number" placeholder="例：30000000" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
            {form.target_amount && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                = NT$ {formatNTD(form.target_amount)}
              </p>
            )}
          </div>
          <div>
            <p className="label" style={{ marginBottom: 6 }}>目標日期（選填）</p>
            <input className="input" type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
          </div>
          <div>
            <p className="label" style={{ marginBottom: 6 }}>備註（選填）</p>
            <input className="input" placeholder="例：55歲退休，月支出8萬" value={form.note} onChange={e => set('note', e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}
            onClick={save} disabled={saving || !form.target_amount}>
            {saving ? '儲存中...' : isEdit ? '儲存變更' : '建立目標'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GoalCard({ goal, currentAssets, onEdit }) {
  const pct = Math.min((currentAssets / goal.target_amount) * 100, 100)
  const remaining = goal.target_amount - currentAssets
  const isAchieved = currentAssets >= goal.target_amount

  // Estimate years to target (simple linear projection — needs snapshots ideally)
  let yearsLeft = null
  if (goal.target_date) {
    const today = new Date()
    const target = new Date(goal.target_date)
    const diff = (target - today) / (1000 * 60 * 60 * 24 * 365)
    yearsLeft = Math.max(0, diff).toFixed(1)
  }

  const barColor = isAchieved
    ? 'var(--profit)'
    : pct > 60 ? 'var(--accent-blue)'
    : pct > 30 ? 'var(--accent-amber)'
    : 'var(--accent-purple)'

  return (
    <div className="card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{goal.name}</h3>
          {goal.note && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{goal.note}</p>}
        </div>
        <button className="btn btn-icon" onClick={() => onEdit(goal)} style={{ flexShrink: 0 }}>
          <Edit2 size={14} />
        </button>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>達成率</span>
          <span style={{ fontSize: 20, fontFamily: 'DM Mono', fontWeight: 600, color: barColor }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div style={{ height: 10, background: 'var(--bg-input)', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}99)`,
            borderRadius: 5, transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <p className="label" style={{ marginBottom: 4 }}>目前資產</p>
          <p style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 500, color: 'var(--accent-blue)' }}>
            {formatNTD(currentAssets)}
          </p>
        </div>
        <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <p className="label" style={{ marginBottom: 4 }}>目標金額</p>
          <p style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 500 }}>
            {formatNTD(goal.target_amount)}
          </p>
        </div>
        <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <p className="label" style={{ marginBottom: 4 }}>還差</p>
          <p style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 500, color: isAchieved ? 'var(--profit)' : 'var(--text-primary)' }}>
            {isAchieved ? '已達成！' : formatNTD(remaining)}
          </p>
        </div>
        <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
          <p className="label" style={{ marginBottom: 4 }}>
            {goal.target_date ? '目標日期' : '距目標日'}
          </p>
          <p style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 500 }}>
            {goal.target_date
              ? yearsLeft === '0.0' ? '已到期' : `${yearsLeft} 年後`
              : '—'}
          </p>
        </div>
      </div>

      {/* Monthly savings needed */}
      {!isAchieved && goal.target_date && yearsLeft > 0 && (
        <div style={{ marginTop: 10, background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)', padding: '10px 14px', border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={14} color="var(--accent-blue)" />
            <span style={{ fontSize: 12, color: 'var(--accent-blue)' }}>
              每月需存入 NT$ {formatNTD(remaining / (yearsLeft * 12))}（不計投資報酬）
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [currentAssets, setCurrentAssets] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editGoal, setEditGoal] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: goalsData }, { data: accounts }] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('accounts').select('*, holdings(*)').eq('user_id', user.id).eq('is_active', true),
    ])

    // Calc total assets
    let total = 0
    for (const acc of accounts || []) {
      for (const h of acc.holdings || []) {
        if (h.asset_type === 'cash') total += Number(h.quantity)
        else total += Number(h.current_price) * Number(h.quantity)
      }
    }

    setGoals(goalsData || [])
    setCurrentAssets(total)
    setLoading(false)
  }

  function handleEdit(goal) {
    setEditGoal(goal)
    setShowModal(true)
  }

  function handleClose() {
    setShowModal(false)
    setEditGoal(null)
  }

  return (
    <div className="page fade-in">
      <PageHeader
        title="目標"
        subtitle="FIRE 財務自由規劃"
        action={
          <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}
            onClick={() => { setEditGoal(null); setShowModal(true) }}>
            <Plus size={15} /> 新增目標
          </button>
        }
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 240, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : goals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>尚未設定目標</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>設定你的 FIRE 目標金額</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }}
            onClick={() => setShowModal(true)}>
            <Plus size={15} /> 建立第一個目標
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Current assets overview */}
          <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color="var(--accent-blue)" />
            </div>
            <div>
              <p className="label">目前總資產</p>
              <p style={{ fontSize: 18, fontFamily: 'DM Mono', fontWeight: 600, color: 'var(--accent-blue)' }}>
                NT$ {formatNTD(currentAssets)}
              </p>
            </div>
          </div>

          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              currentAssets={currentAssets}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {showModal && (
        <GoalModal
          goal={editGoal}
          onClose={handleClose}
          onSaved={() => { handleClose(); loadData() }}
        />
      )}
    </div>
  )
}
