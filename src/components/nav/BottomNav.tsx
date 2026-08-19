import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/spending', label: 'Spending', icon: '▤' },
  { to: '/insights', label: 'Insights', icon: '✦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export function BottomNav() {
  return (
    <nav className="flex items-center justify-around border-t border-border bg-surface-raised px-2 py-2">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-xs font-semibold transition-colors ${
              isActive ? 'text-gold-500' : 'text-ink-faint hover:text-ink-muted'
            }`
          }
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
