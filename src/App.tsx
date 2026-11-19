import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useAdminTheme } from './components/ThemeToggle.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import { auth, authPersistenceReady } from './firebase.ts';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminDetailPage } from './pages/AdminDetailPage.tsx';
import { AdminLoginPage } from './pages/AdminLoginPage.tsx';
import { AdminUsersPage } from './pages/AdminUsersPage.tsx';
import { PublicFormPage } from './pages/PublicFormPage.tsx';
import {
  recordSessionAudit,
  resolvePanelUserProfile,
} from './services/firestoreService.ts';
import type { PanelUserProfile } from './shared/schema.ts';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_WARNING_MS = 28 * 60 * 1000;

function hasRegistrationFilterParams(searchStr: string): boolean {
  if (!searchStr) return false;
  const params = new URLSearchParams(searchStr);
  return (
    params.has('q') ||
    params.has('ver') ||
    params.has('status') ||
    params.has('roles') ||
    params.has('maritalStatus') ||
    params.has('dateFrom') ||
    params.has('dateTo') ||
    params.has('birthPlace') ||
    params.has('nationality') ||
    params.has('unseenOnly') ||
    params.has('page')
  );
}

function AppRoutes() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');
  const [searchStr, setSearchStr] = useState<string>(() => window.location.search || '');
  const [panelUser, setPanelUser] = useState<PanelUserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);

  const { isDark, toggleTheme, setDark } = useAdminTheme();
  const panelUserRef = useRef<PanelUserProfile | null>(null);
  panelUserRef.current = panelUser;
  const lastActivityRef = useRef<number>(Date.now());

  const navigate = useCallback((nextPath: string) => {
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPathname(window.location.pathname || '/');
    setSearchStr(window.location.search || '');
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
      setSearchStr(window.location.search || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const isAdminRoute = pathname.startsWith('/admin');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isAdminRoute && isDark);
  }, [isAdminRoute, isDark]);

  useEffect(() => {
    if (!isAdminRoute) {
      return;
    }

    let active = true;
    let settled = false;
    let unsubscribe = () => {};

    const safetyTimer = window.setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      setAuthChecked(true);
    }, 4000);

    void authPersistenceReady
      .catch(() => {})
      .then(() => {
        if (!active) return;

        unsubscribe = onAuthStateChanged(
          auth,
          async (firebaseUser) => {
            if (!active) return;

            if (!firebaseUser) {
              settled = true;
              window.clearTimeout(safetyTimer);
              setPanelUser(null);
              setIdleWarningVisible(false);
              setAuthChecked(true);
              return;
            }

            try {
              const profile = await Promise.race([
                resolvePanelUserProfile(firebaseUser),
                new Promise<null>((_, reject) => {
                  window.setTimeout(() => reject(new Error('timeout')), 6000);
                }),
              ]);
              if (!active) return;
              settled = true;
              window.clearTimeout(safetyTimer);
              if (!profile) {
                await signOut(auth).catch(() => {});
                setPanelUser(null);
                setLoginNotice('Acesso não autorizado.');
              } else {
                lastActivityRef.current = Date.now();
                setLoginNotice(null);
                setPanelUser(profile);
              }
            } catch {
              if (!active) return;
              settled = true;
              window.clearTimeout(safetyTimer);
              await signOut(auth).catch(() => {});
              setPanelUser(null);
              setLoginNotice('Não foi possível validar sua sessão. Entre novamente.');
            } finally {
              if (active) {
                settled = true;
                window.clearTimeout(safetyTimer);
                setAuthChecked(true);
              }
            }
          },
          () => {
            if (!active) return;
            settled = true;
            window.clearTimeout(safetyTimer);
            setPanelUser(null);
            setAuthChecked(true);
          }
        );
      });

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [isAdminRoute]);

  const performLogout = useCallback(
    async (reason: 'manual' | 'inactivity') => {
      const currentActor = panelUserRef.current;
      try {
        if (currentActor) {
          await recordSessionAudit(
            currentActor,
            reason === 'inactivity' ? 'LOGOUT_INATIVIDADE' : 'LOGOUT'
          ).catch(() => {});
        }
        await signOut(auth);
      } catch {
        // ignora erro caso sessão já tenha sido encerrada
      } finally {
        setIdleWarningVisible(false);
        setPanelUser(null);
        setLoginNotice(
          reason === 'inactivity'
            ? 'Sua sessão foi encerrada automaticamente após 30 minutos sem atividade.'
            : null
        );
        navigate('/admin/login');
      }
    },
    [navigate]
  );

  // Controle de expiração automática após 30 minutos de inatividade com aviso prévio (aos 28 min)
  useEffect(() => {
    if (!isAdminRoute || !panelUser) {
      setIdleWarningVisible(false);
      return;
    }

    lastActivityRef.current = Date.now();
    setIdleWarningVisible(false);

    const recordActivity = () => {
      if (idleWarningVisible) return;
      lastActivityRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    for (const ev of events) {
      window.addEventListener(ev, recordActivity, { passive: true });
    }

    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        window.clearInterval(intervalId);
        void performLogout('inactivity');
        return;
      }
      if (elapsed >= INACTIVITY_WARNING_MS) {
        const secsLeft = Math.max(
          1,
          Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000)
        );
        setRemainingSeconds(secsLeft);
        setIdleWarningVisible(true);
      } else {
        setIdleWarningVisible(false);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      for (const ev of events) {
        window.removeEventListener(ev, recordActivity);
      }
    };
  }, [isAdminRoute, panelUser, idleWarningVisible, performLogout]);

  const handleStayConnected = () => {
    lastActivityRef.current = Date.now();
    setIdleWarningVisible(false);
  };

  if (!isAdminRoute) {
    return <PublicFormPage onNavigate={navigate} />;
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--surface-bg)] flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border-2 border-[#1F2E85] dark:border-[#229A9A] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!panelUser) {
    return (
      <AdminLoginPage
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLoginSuccess={(user) => {
          lastActivityRef.current = Date.now();
          setLoginNotice(null);
          setPanelUser(user);
          setAuthChecked(true);
        }}
        onNavigate={navigate}
        externalNotice={loginNotice}
      />
    );
  }

  const idleWarningBanner = idleWarningVisible ? (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[1px]"
    >
      <div className="animate-modal-expand w-full max-w-md bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-6 shadow-[var(--shadow-elevated)]">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex items-center justify-center text-[var(--status-warning)] shrink-0">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="idle-warning-title"
              className="font-display text-base font-bold text-[var(--text-primary)]"
            >
              Sessão prestes a expirar
            </h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Por segurança, você será desconectado automaticamente em{' '}
              <strong className="tabular-nums text-[var(--text-primary)]">
                {remainingSeconds}s
              </strong>{' '}
              por inatividade.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void performLogout('manual')}
            className="inline-flex h-10 items-center px-3.5 rounded-[10px] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            Sair agora
          </button>
          <button
            type="button"
            onClick={handleStayConnected}
            className="ameta-btn-interactive inline-flex h-10 items-center px-4 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white"
          >
            Continuar conectado
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (pathname === '/admin/usuarios' && panelUser.role === 'admin') {
    return (
      <>
        <AdminUsersPage
          user={panelUser}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onLogout={() => void performLogout('manual')}
          onNavigate={navigate}
        />
        {idleWarningBanner}
      </>
    );
  }

  const detailMatch = /^\/admin\/cadastros\/([^/]+)$/.exec(pathname);
  if (detailMatch) {
    return (
      <>
        <AdminDetailPage
          registrationId={decodeURIComponent(detailMatch[1])}
          user={panelUser}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onLogout={() => void performLogout('manual')}
          onNavigate={navigate}
        />
        {idleWarningBanner}
      </>
    );
  }

  const activeSection =
    pathname === '/admin/cadastros'
      ? 'cadastros'
      : pathname === '/admin/termos'
        ? 'termos'
        : pathname === '/admin/auditoria'
          ? 'auditoria'
          : pathname === '/admin/configuracoes'
            ? 'configuracoes'
            : pathname === '/admin' && hasRegistrationFilterParams(searchStr)
              ? 'cadastros'
              : 'inicio';

  return (
    <>
      <AdminDashboardPage
        user={panelUser}
        activeSection={activeSection}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onSetDark={setDark}
        onLogout={() => void performLogout('manual')}
        onNavigate={navigate}
      />
      {idleWarningBanner}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </ErrorBoundary>
  );
}
