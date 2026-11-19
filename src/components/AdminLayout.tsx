import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ContractorRegistrationDetail, PanelUserProfile } from '../shared/schema.ts';
import { formatDateBR } from '../shared/validators.ts';
import { AmetaLogo } from './AmetaLogo.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

export type AdminNavSection =
  | 'inicio'
  | 'cadastros'
  | 'termos'
  | 'usuarios'
  | 'auditoria'
  | 'configuracoes';

interface AdminLayoutProps {
  user: PanelUserProfile;
  activeNav: AdminNavSection;
  pageTitle: string;
  pageSubtitle?: string;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  headerActions?: ReactNode;
  globalSearch?: string;
  onGlobalSearchChange?: (value: string) => void;
  onGlobalSearchSubmit?: (value: string) => void;
  newCount?: number;
  recentNewItems?: ContractorRegistrationDetail[];
  onOpenRegistration?: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'ameta_admin_sidebar_collapsed';

export function AdminLayout({
  user,
  activeNav,
  pageTitle,
  pageSubtitle,
  breadcrumbs,
  headerActions,
  globalSearch = '',
  onGlobalSearchChange,
  onGlobalSearchSubmit,
  newCount = 0,
  recentNewItems = [],
  onOpenRegistration,
  isDark,
  onToggleTheme,
  onLogout,
  onNavigate,
  children,
}: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(globalSearch);

  const bellRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setBellOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBellOpen(false);
        setUserMenuOpen(false);
        setMobileDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const isAdmin = user.role === 'admin';

  const allNavItems: Array<{
    id: AdminNavSection;
    label: string;
    path: string;
    icon: typeof LayoutDashboard;
    adminOnly?: boolean;
    badge?: number;
  }> = [
    { id: 'inicio', label: 'Início', path: '/admin', icon: LayoutDashboard },
    {
      id: 'cadastros',
      label: 'Cadastros',
      path: '/admin/cadastros',
      icon: ClipboardList,
      badge: newCount > 0 ? newCount : undefined,
    },
    { id: 'termos', label: 'Termos gerados', path: '/admin/termos', icon: ScrollText },
    {
      id: 'usuarios',
      label: 'Usuários',
      path: '/admin/usuarios',
      icon: ShieldCheck,
      adminOnly: true,
    },
    {
      id: 'auditoria',
      label: 'Auditoria',
      path: '/admin/auditoria',
      icon: History,
      adminOnly: true,
    },
    { id: 'configuracoes', label: 'Configurações', path: '/admin/configuracoes', icon: Settings },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  const handleNavClick = (path: string) => {
    setMobileDrawerOpen(false);
    onNavigate(path);
  };

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    onGlobalSearchChange?.(val);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onGlobalSearchSubmit) {
        onGlobalSearchSubmit(localSearch);
      } else if (activeNav !== 'cadastros' && localSearch.trim()) {
        onNavigate(`/admin/cadastros?q=${encodeURIComponent(localSearch.trim())}`);
      }
    }
  };

  const userInitials = user.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'AM';

  const mobileQuickNav = navItems.slice(0, 4);

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] text-[var(--text-primary)] flex">
      {/* Sidebar fixa desktop */}
      <aside
        aria-label="Menu principal"
        className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen z-30 transition-[width] duration-200 ease-out select-none bg-[#1F2E85] dark:bg-[#0F172A] text-white border-r border-[#172368] dark:border-[#1E293B] ${
          collapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        <div
          className={`h-16 px-3.5 flex items-center border-b border-white/10 ${
            collapsed ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('/admin');
            }}
            className="flex items-center min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#229A9A] rounded-[10px]"
            title="Ir para Início"
          >
            {collapsed ? (
              <span className="h-10 w-10 rounded-[10px] bg-white flex items-center justify-center shadow-sm">
                <AmetaLogo variant="symbol" size="sm" />
              </span>
            ) : (
              <AmetaLogo variant="card" size="sm" className="!px-2.5 !py-1.5" />
            )}
          </a>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <a
                key={item.id}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(item.path);
                }}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center rounded-[10px] min-h-[44px] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  collapsed ? 'justify-center px-2' : 'justify-between px-3 gap-3'
                } ${
                  isActive
                    ? 'bg-[#229A9A] text-white font-semibold shadow-sm'
                    : 'text-white/80 hover:bg-white/10 hover:text-white font-medium'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      isActive ? 'text-white' : 'text-white/75 group-hover:text-white'
                    }`}
                    aria-hidden="true"
                  />
                  {!collapsed && <span className="text-[13.5px] truncate">{item.label}</span>}
                </span>
                {!collapsed && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-[6px] text-[11px] font-bold tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#229A9A] text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="p-2.5 border-t border-white/10 space-y-1.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('/');
            }}
            title={collapsed ? 'Formulário público' : undefined}
            className={`flex items-center rounded-[10px] min-h-[42px] text-white/80 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              collapsed ? 'justify-center px-2' : 'px-3 gap-3'
            }`}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="text-xs font-medium">Formulário público</span>}
          </a>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className={`w-full flex items-center rounded-[10px] min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap ${
              collapsed ? 'justify-center px-2' : 'justify-between px-3'
            }`}
          >
            {!collapsed && <span className="text-xs font-medium">Recolher menu</span>}
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Menu mobile"
            className="relative w-72 max-w-[85vw] h-full bg-[#1F2E85] dark:bg-[#0F172A] text-white flex flex-col shadow-2xl"
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
              <AmetaLogo variant="card" size="sm" className="!px-2.5 !py-1.5" />
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Fechar menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <a
                    key={item.id}
                    href={item.path}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNavClick(item.path);
                    }}
                    className={`flex items-center justify-between px-3.5 min-h-[46px] rounded-[10px] text-sm whitespace-nowrap ${
                      isActive
                        ? 'bg-[#229A9A] text-white font-semibold'
                        : 'text-white/85 hover:bg-white/10 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-bold tabular-nums bg-white/20 text-white">
                        {item.badge}
                      </span>
                    )}
                  </a>
                );
              })}
            </nav>

            <div className="p-3 border-t border-white/10 space-y-2">
              <div className="px-3 py-2 rounded-[10px] bg-white/10 text-xs">
                <p className="font-semibold text-white truncate">{user.nome}</p>
                <p className="text-white/75">
                  {user.role === 'admin' ? 'Administrador' : 'Operador'}
                </p>
              </div>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('/');
                }}
                className="flex items-center gap-2.5 px-3 min-h-[44px] rounded-[10px] text-xs font-medium text-white/85 hover:bg-white/10"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>Abrir formulário público</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 min-h-[44px] rounded-[10px] text-xs font-semibold text-red-200 hover:bg-red-500/20"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Área principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-20 h-16 bg-[var(--surface-card)]/95 backdrop-blur-sm border-b border-[var(--border-default)] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Abrir menu de navegação"
              className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] shrink-0"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="relative flex-1 max-w-md hidden sm:block">
              <Search
                className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={localSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar prestador por nome, CPF, CNPJ ou telefone..."
                aria-label="Busca global no painel"
                className="w-full h-10 pl-10 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sino de notificações de novos cadastros */}
            <div className="relative" ref={bellRef}>
              <button
                type="button"
                onClick={() => setBellOpen((prev) => !prev)}
                aria-label={`Notificações (${newCount} novos cadastros)`}
                aria-expanded={bellOpen}
                className="ameta-btn-interactive relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {newCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-[6px] bg-[#229A9A] text-white text-[10px] font-bold tabular-nums flex items-center justify-center shadow-sm">
                    {newCount > 99 ? '99+' : newCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-elevated)] overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      Novos cadastros
                    </span>
                    <span className="text-[11px] font-semibold text-[#229A9A] tabular-nums">
                      {newCount} pendente(s)
                    </span>
                  </div>
                  {recentNewItems.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                      Nenhum cadastro novo no momento.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border-default)] max-h-72 overflow-y-auto">
                      {recentNewItems.slice(0, 5).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setBellOpen(false);
                              if (onOpenRegistration) {
                                onOpenRegistration(item.id);
                              } else {
                                onNavigate(`/admin/cadastros?ver=${encodeURIComponent(item.id)}`);
                              }
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {item.fullName}
                              </p>
                              <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                {item.role}
                              </p>
                            </div>
                            <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                              {formatDateBR(item.registrationDate)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="px-3 py-2 border-t border-[var(--border-default)] bg-[var(--surface-subtle)]">
                    <button
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        onNavigate('/admin/cadastros?status=Novo');
                      }}
                      className="w-full h-9 rounded-[8px] text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:bg-[var(--surface-card)] transition-colors"
                    >
                      Ver todos os cadastros novos
                    </button>
                  </div>
                </div>
              )}
            </div>

            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />

            {/* Menu do usuário */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
                className="ameta-btn-interactive inline-flex h-11 items-center gap-2.5 pl-2 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <span className="h-7 w-7 rounded-[8px] bg-[#1F2E85] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {userInitials}
                </span>
                <span className="hidden lg:block text-left leading-tight">
                  <span className="block text-xs font-semibold text-[var(--text-primary)] max-w-[140px] truncate">
                    {user.nome}
                  </span>
                  <span className="block text-[10.5px] text-[var(--text-muted)]">
                    {user.role === 'admin' ? 'Administrador' : 'Operador'}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-elevated)] overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[var(--border-default)]">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {user.nome}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {user.email}
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-[6px] bg-[var(--status-info-bg)] text-[var(--status-info)] text-[10.5px] font-semibold">
                      {user.role === 'admin' ? 'Administrador' : 'Operador'}
                    </span>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('/admin/configuracoes');
                      }}
                      className="w-full px-3 h-10 rounded-[8px] text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-2.5"
                    >
                      <Settings className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                      <span>Configurações</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full px-3 h-10 rounded-[8px] text-left text-xs font-semibold text-[var(--status-error)] hover:bg-[var(--status-error-bg)] flex items-center gap-2.5"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sair do painel</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="Sair do painel"
              className="ameta-btn-interactive hidden sm:inline-flex h-11 items-center gap-1.5 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {/* Conteúdo da página */}
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 md:pb-10 animate-page-enter">
          {/* Cabeçalho com trilha + título + ações */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div className="min-w-0">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Trilha de navegação" className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  {breadcrumbs.map((crumb, idx) => (
                    <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1.5">
                      {idx > 0 && <span aria-hidden="true">/</span>}
                      {crumb.path ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(crumb.path!)}
                          className="hover:text-[var(--text-primary)] transition-colors"
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span className="font-medium text-[var(--text-secondary)]">
                          {crumb.label}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {pageTitle}
              </h1>
              {pageSubtitle && (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{pageSubtitle}</p>
              )}
            </div>
            {headerActions && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">{headerActions}</div>
            )}
          </div>

          {children}
        </main>
      </div>

      {/* Barra inferior compacta no mobile (<= 15% altura) */}
      <nav
        aria-label="Navegação rápida mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[var(--surface-card)]/95 backdrop-blur-sm border-t border-[var(--border-default)] px-2 flex items-center justify-around"
      >
        {mobileQuickNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.path)}
              className={`relative flex flex-col items-center justify-center px-3 h-11 rounded-[10px] text-[10.5px] font-medium whitespace-nowrap ${
                isActive
                  ? 'text-[#229A9A] font-semibold'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="h-4 w-4 mb-0.5" aria-hidden="true" />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-[#229A9A]" />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center px-3 h-11 rounded-[10px] text-[10.5px] font-medium text-[var(--text-muted)] whitespace-nowrap"
        >
          <Menu className="h-4 w-4 mb-0.5" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
