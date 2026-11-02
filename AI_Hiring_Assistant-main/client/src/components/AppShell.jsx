import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHealth } from '../hooks/useHealth';
import { Badge } from './ui';
import { IconBook, IconDashboard, IconLogout, IconSpark, IconUsers } from './icons';

const NAV = [
  { to: '/', label: 'Recruitment', icon: IconDashboard, end: true },
  { to: '/applications', label: 'Applications', icon: IconUsers },
  { to: '/roles/new', label: 'New role', icon: IconSpark },
  { to: '/knowledge', label: 'Knowledge base', icon: IconBook },
];

function AiModeBadge() {
  const health = useHealth();
  if (!health) return null;

  return health.ai.configured ? (
    <Badge tone="good">
      <span className="h-1.5 w-1.5 rounded-full bg-good" />
      Gemini {health.ai.model}
    </Badge>
  ) : (
    <Badge tone="warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Offline demo mode — no API key
    </Badge>
  );
}

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
        <div className="flex items-center gap-2.5 rounded-lg bg-accent px-3 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-ink shadow-sm">
            <IconTargetMark />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight text-ink">NEX Recruit</p>
            <p className="text-[11px] text-muted">Prototype workspace</p>
          </div>
        </div>

        <div className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Workspace</div>
        <nav className="mt-2 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-ink shadow-sm'
                    : 'text-ink-2 hover:bg-raised hover:text-ink'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="rounded-lg bg-accent p-3">
            <p className="truncate text-[13px] font-semibold text-ink">{user?.name}</p>
            <p className="truncate text-[11px] text-muted">{user?.company || user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink transition-colors hover:bg-raised hover:text-ink"
          >
            <IconLogout />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-white/90 px-5 py-3.5 backdrop-blur">
          <nav className="flex items-center gap-1 md:hidden">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${
                    isActive ? 'bg-accent text-ink' : 'text-ink-2'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <p className="hidden text-[13px] font-medium text-ink-2 md:block">{pathname === '/' ? 'Recruitment workspace' : 'NEX Recruit workspace'}</p>
          <AiModeBadge />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
      </div>
    </div>
  );
}

function IconTargetMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12h5l2-5 3 10 2-5h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
