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
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 430,
      zIndex: 100,
      background: BG,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      /* 直接用 CSS env() 吃掉 safe area，不需要 JS 量測
         在沒有 home indicator 的裝置上 fallback 為 0px */
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* 圖示列固定 64px */}
      <div style={{ display: 'flex', alignItems: 'center', height: 64 }}>
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
      </div>
    </nav>
  )
}
