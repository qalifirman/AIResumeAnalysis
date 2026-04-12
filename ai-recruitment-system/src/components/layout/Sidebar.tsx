
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
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <aside className="hidden md:flex flex-col w-64 h-full bg-surface-dark border-r border-border-dark flex-shrink-0">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border-dark">
        <div className="size-9 flex items-center justify-center rounded-xl bg-primary/20 border border-primary/30 flex-shrink-0">
          <span className="material-symbols-outlined fill text-primary" style={{fontSize:'20px'}}>psychology</span>
        </div>
        <div>
          <h1 className="text-sm font-bold leading-none text-white">Resume<span className="text-primary">AI</span></h1>
          <span className="text-xs text-text-muted mt-0.5 block">{portalLabel}</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => onTabChange(item.id)}
            className={`nav-item w-full ${activeTab === item.id ? 'active' : ''}`}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border-dark">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-card">
          <div className="size-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
          </div>
          <button onClick={logout} title="Sign out" className="text-text-muted hover:text-white transition-colors flex-shrink-0">
            <span className="material-symbols-outlined ms-sm">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
