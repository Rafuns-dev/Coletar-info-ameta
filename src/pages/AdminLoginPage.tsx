import { FirebaseError } from 'firebase/app';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { auth } from '../firebase.ts';
import {
  extractFriendlyFirestoreMessage,
  resolvePanelUserProfile,
} from '../services/firestoreService.ts';
import type { PanelUserProfile } from '../shared/schema.ts';

interface AdminLoginPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onLoginSuccess: (user: PanelUserProfile) => void;
  onNavigate: (path: string) => void;
}

function mapFirebaseAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/invalid-email':
        return 'Informe um e-mail válido.';
      case 'auth/user-disabled':
        return 'Esta conta foi desativada no Firebase Authentication.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Aguarde alguns minutos ou redefina sua senha.';
      case 'auth/network-request-failed':
        return 'Falha de conexão com o Firebase. Verifique sua internet.';
      default:
        return `Erro ao autenticar (${error.code}).`;
    }
  }
  return extractFriendlyFirestoreMessage(
    error,
    'Não foi possível autenticar. Verifique sua conexão.'
  );
}

export function AdminLoginPage({
  isDark,
  onToggleTheme,
  onLoginSuccess,
  onNavigate,
}: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await resolvePanelUserProfile(credential.user);
      if (!profile) {
        await signOut(auth);
        setError(
          'Esta conta não possui acesso ativo cadastrado na equipe da Ameta (/usuarios).'
        );
        return;
      }
      onLoginSuccess(profile);
      onNavigate('/admin');
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setInfoMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Informe seu e-mail corporativo acima antes de solicitar a redefinição.');
      return;
    }

    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setInfoMessage(
        'Se o e-mail estiver cadastrado, enviamos um link de redefinição de senha.'
      );
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Formulário público</span>
        </a>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-8">
          <div className="mb-7">
            <AmetaLogo size="md" />
            <h1 className="mt-5 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              Acesso Administrativo
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Área restrita à equipe interna da Ameta.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {infoMessage && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"
              >
                {infoMessage}
              </div>
            )}

            <div>
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                E-mail corporativo
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@ameta.com.br"
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20 dark:focus:ring-slate-400/20 focus:border-[#0F2942] dark:focus:border-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Senha
                </label>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => void handlePasswordReset()}
                  className="text-xs font-medium text-[#0F2942] dark:text-slate-300 hover:underline disabled:opacity-50"
                >
                  {resetting ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20 dark:focus:ring-slate-400/20 focus:border-[#0F2942] dark:focus:border-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 mt-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-white dark:text-[#0F2942] font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  <span>Entrar no painel</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
