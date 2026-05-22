import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, TrendingUp, BarChart2, Target } from 'lucide-react'

const tabs = [
  { to: '/',        icon: LayoutDashboard, label: '總覽' },
  { to: '/assets',  icon: Wallet,          label: '資產' },
  { to: '/invest',  icon: TrendingUp,      label: '投資' },
  { to: '/trend',   icon: BarChart2,       label: '趨勢' },
  { to: '/goals',   icon: Target,          label: '目標' },
]

const BG = 'rgba(8,12,20,0.97)'

export default function BottomNav() {
  return (
    <>
      {/* 圖示列，高度固定 64px，貼在 safe area 上方 */}
      <nav style={{
        position: 'fixed',
        bottom: 'var(--safe-bottom)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 430,
        height: 64,
        zIndex: 100,
        background: BG,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
      }}>
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={{ flex: 1, textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 0',
                color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                transition: 'color 0.15s',
              }}>
                <Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
                <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, letterSpacing: '0.03em' }}>
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* safe area 填色，蓋住 home indicator */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 430,
        height: 'var(--safe-bottom)',
        background: BG,
        zIndex: 100,
      }} />
    </>
  )
}
