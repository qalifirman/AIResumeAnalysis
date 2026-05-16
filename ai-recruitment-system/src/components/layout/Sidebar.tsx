import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem { icon: string; label: string; id: string; }
interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  navItems: NavItem[];
  portalLabel: string;
}

export function Sidebar({ activeTab, onTabChange, navItems, portalLabel }: SidebarProps) {
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  // Mobile bottom nav — show up to 5 items
  const mobileItems = navItems;

  return (
    <>
    {/* Mobile bottom nav */}
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-dark border-t border-border-dark flex items-center justify-around px-2 h-16 safe-bottom">
      {mobileItems.map(item => (
        <button key={item.id} onClick={() => onTabChange(item.id)}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors flex-1 max-w-[80px]
            ${activeTab === item.id ? 'text-primary' : 'text-text-muted hover:text-white'}`}>
          <span className={`material-symbols-outlined text-[22px]${activeTab === item.id ? ' fill' : ''}`}>{item.icon}</span>
          <span className="text-[10px] font-medium leading-none truncate w-full text-center">{item.label}</span>
        </button>
      ))}
    </nav>

    <aside className={`hidden md:flex flex-col h-full bg-surface-dark border-r border-border-dark flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>

      {/* Brand — exactly h-16 to align with top bar */}
      <div className="h-16 flex items-center border-b border-border-dark flex-shrink-0 px-3 gap-3 overflow-hidden">
        {/* Hamburger toggle always at the far left of the brand bar */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="size-9 flex items-center justify-center rounded-xl text-text-muted hover:text-white hover:bg-surface-hover transition-all flex-shrink-0"
        >
          <span className="material-symbols-outlined ms-sm">menu</span>
        </button>

        {!collapsed && (
          <>
            <div className="size-9 flex items-center justify-center rounded-xl bg-primary/20 border border-primary/30 flex-shrink-0">
              <span className="material-symbols-outlined fill text-primary" style={{ fontSize: '20px' }}>psychology</span>
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-base font-bold leading-none text-white whitespace-nowrap">
                JobMatch <span className="text-primary">AI</span>
              </h1>
              <span className="text-xs text-text-muted mt-0.5 block truncate">{portalLabel}</span>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => (
          collapsed ? (
            <button key={item.id} onClick={() => onTabChange(item.id)} title={item.label}
              className={`nav-item-icon ${activeTab === item.id ? 'active' : ''}`}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
          ) : (
            <button key={item.id} onClick={() => onTabChange(item.id)}
              className={`nav-item w-full ${activeTab === item.id ? 'active' : ''}`}>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        ))}
      </nav>

      {/* User profile card */}
      <div className="p-2 border-t border-border-dark flex-shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.name}
                className="size-9 rounded-full object-cover border-2 border-primary/30" />
            ) : (
              <div className="size-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                {initials}
              </div>
            )}
            <button onClick={logout} title="Sign out"
              className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined ms-sm">logout</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-hover/50 border border-border-dark">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.name}
                className="size-9 rounded-full object-cover border-2 border-primary/30 flex-shrink-0" />
            ) : (
              <div className="size-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-text-muted truncate capitalize">
                {user?.role === 'hr' ? 'HR Manager' : 'Job Seeker'}
              </p>
            </div>
            <button onClick={logout} title="Sign out"
              className="text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 p-1.5 rounded-lg">
              <span className="material-symbols-outlined ms-sm">logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
