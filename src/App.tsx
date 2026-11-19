import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useAdminTheme } from './components/ThemeToggle.tsx';
import { auth } from './firebase.ts';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminDetailPage } from './pages/AdminDetailPage.tsx';
import { AdminLoginPage } from './pages/AdminLoginPage.tsx';
import { PublicFormPage } from './pages/PublicFormPage.tsx';
import { resolvePanelUserProfile } from './services/firestoreService.ts';
import type { PanelUserProfile } from './shared/schema.ts';

function AppRoutes() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');
  const [panelUser, setPanelUser] = useState<PanelUserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { isDark, toggleTheme } = useAdminTheme();

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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;

      if (!firebaseUser) {
        setPanelUser(null);
        setAuthChecked(true);
        return;
      }

      try {
        const profile = await resolvePanelUserProfile(firebaseUser);
        if (!active) return;
        if (!profile) {
          await signOut(auth);
          setPanelUser(null);
        } else {
          setPanelUser(profile);
        }
      } catch {
        if (!active) return;
        setPanelUser(null);
      } finally {
        if (active) {
          setAuthChecked(true);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isAdminRoute]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // ignora erro caso sessão já tenha sido encerrada
    } finally {
      setPanelUser(null);
      navigate('/admin/login');
    }
  }, [navigate]);

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
          setPanelUser(user);
          setAuthChecked(true);
        }}
        onNavigate={navigate}
      />
    );
  }

  if (pathname === '/admin/login') {
    return (
      <AdminDashboardPage
        user={panelUser}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        onNavigate={navigate}
      />
    );
  }

  const detailMatch = /^\/admin\/cadastros\/([^/]+)$/.exec(pathname);
  if (detailMatch) {
    return (
      <AdminDetailPage
        registrationId={decodeURIComponent(detailMatch[1])}
        user={panelUser}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        onNavigate={navigate}
      />
    );
  }

  return (
    <AdminDashboardPage
      user={panelUser}
      isDark={isDark}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
      onNavigate={navigate}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}
