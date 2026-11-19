import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useAdminTheme } from './components/ThemeToggle.tsx';
import { auth, authPersistenceReady } from './firebase.ts';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminDetailPage } from './pages/AdminDetailPage.tsx';
import { AdminLoginPage } from './pages/AdminLoginPage.tsx';
import { PublicFormPage } from './pages/PublicFormPage.tsx';
import {
  recordSessionAudit,
  resolvePanelUserProfile,
} from './services/firestoreService.ts';
import type { PanelUserProfile } from './shared/schema.ts';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_WARNING_MS = 28 * 60 * 1000;

function AppRoutes() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');
  const [panelUser, setPanelUser] = useState<PanelUserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);

  const { isDark, toggleTheme } = useAdminTheme();
  const panelUserRef = useRef<PanelUserProfile | null>(null);
  panelUserRef.current = panelUser;
  const lastActivityRef = useRef<number>(Date.now());

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPathname(nextPath);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const isAdminRoute = pathname.startsWith('/admin');

  useEffect(() => {
    if (!isAdminRoute) {
      document.documentElement.classList.remove('dark');
      return;
    }

    let active = true;
    let unsubscribe = () => {};

    void authPersistenceReady.then(() => {
      if (!active) return;

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!active) return;

        if (!firebaseUser) {
          setPanelUser(null);
          setIdleWarningVisible(false);
          setAuthChecked(true);
          return;
        }

        try {
          const profile = await resolvePanelUserProfile(firebaseUser);
          if (!active) return;
          if (!profile) {
            await signOut(auth);
            setPanelUser(null);
            setLoginNotice('Acesso não autorizado.');
          } else {
            lastActivityRef.current = Date.now();
            setLoginNotice(null);
            setPanelUser(profile);
          }
        } catch {
          if (!active) return;
          await signOut(auth).catch(() => {});
          setPanelUser(null);
          setLoginNotice('Acesso não autorizado.');
        } finally {
          if (active) {
            setAuthChecked(true);
          }
        }
      });
    });

    return () => {
      active = false;
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
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-[#0F2942] dark:border-slate-300 border-t-transparent animate-spin" />
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
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/65"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="idle-warning-title"
              className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Sessão prestes a expirar
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              Por segurança, você será desconectado automaticamente em{' '}
              <strong className="tabular-nums">{remainingSeconds}s</strong> por inatividade.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void performLogout('manual')}
            className="inline-flex h-9 items-center px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sair agora
          </button>
          <button
            type="button"
            onClick={handleStayConnected}
            className="inline-flex h-9 items-center px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942]"
          >
            Continuar conectado
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (pathname === '/admin/login') {
    return (
      <>
        <AdminDashboardPage
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

  return (
    <>
      <AdminDashboardPage
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}
