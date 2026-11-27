import { FirebaseError } from 'firebase/app';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { auth, authPersistenceReady, firebaseRuntimeConfig } from '../firebase.ts';
import {
  extractFirebaseErrorDetails,
  extractFriendlyFirestoreMessage,
  recordSessionAudit,
  resolvePanelUserAccess,
} from '../services/firestoreService.ts';
import type { PanelUserProfile } from '../shared/schema.ts';

interface AdminLoginPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onLoginSuccess: (user: PanelUserProfile) => void;
  onNavigate: (path: string) => void;
  externalNotice?: string | null;
}

function mapFirebaseAuthError(error: unknown): string {
  const details = extractFirebaseErrorDetails(
    error,
    'Falha desconhecida ao autenticar.'
  );

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return `E-mail ou senha incorretos. (${error.code}: ${error.message})`;
      case 'auth/too-many-requests':
        return `Muitas tentativas seguidas. Acesso temporariamente bloqueado; aguarde alguns minutos ou utilize "Esqueci minha senha". (${error.code}: ${error.message})`;
      case 'auth/user-disabled':
        return `Esta conta foi desativada no Firebase Authentication. (${error.code}: ${error.message})`;
      case 'auth/operation-not-allowed':
        return `Login por E-mail/Senha ainda não está ativado no Console do Firebase. (${error.code}: ${error.message})`;
      case 'auth/network-request-failed':
        return `Falha de conexão com o Firebase Authentication. Verifique sua internet. (${error.code}: ${error.message})`;
      default:
        return `Não foi possível entrar no Firebase Auth. (${error.code}: ${error.message})`;
    }
  }

  return extractFriendlyFirestoreMessage(
    error,
    `Não foi possível validar seu acesso no Firestore (${details.message}).`,
    true
  );
}

export function AdminLoginPage({
  isDark,
  onToggleTheme,
  onLoginSuccess,
  onNavigate,
  externalNotice = null,
}: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(externalNotice);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (externalNotice) {
      setError((prev) => prev || externalNotice);
    }
  }, [externalNotice]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      await authPersistenceReady;
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const access = await resolvePanelUserAccess(credential.user);

      if (access.status === 'missing_doc') {
        await signOut(auth).catch(() => {});
        const msg = `Autenticado no Firebase Auth, mas o documento usuarios/${access.uid} não existe no banco "${access.databaseId}".`;
        console.error('[Ameta Login - Perfil ausente]', {
          uid: access.uid,
          email: credential.user.email,
          projectId: firebaseRuntimeConfig.projectId,
          databaseId: access.databaseId,
        });
        setError(msg);
        return;
      }

      if (access.status === 'inactive') {
        await signOut(auth).catch(() => {});
        const msg = `Acesso bloqueado: o documento usuarios/${access.profile.uid} está com ativo = false.`;
        console.error('[Ameta Login - Usuário inativo]', {
          uid: access.profile.uid,
          email: access.profile.email,
          databaseId: firebaseRuntimeConfig.databaseId,
        });
        setError(msg);
        return;
      }

      if (access.status === 'invalid_role') {
        await signOut(auth).catch(() => {});
        const msg = `Acesso negado: o campo role ("${access.rawRole}") em usuarios/${access.uid} não possui permissão para o painel.`;
        console.error('[Ameta Login - Role inválida]', {
          uid: access.uid,
          rawRole: access.rawRole,
          databaseId: firebaseRuntimeConfig.databaseId,
        });
        setError(msg);
        return;
      }

      void recordSessionAudit(access.profile, 'LOGIN').catch(() => {});
      onLoginSuccess(access.profile);
      onNavigate('/admin');
    } catch (err) {
      const details = extractFirebaseErrorDetails(err);
      console.error('[Ameta Login - Erro Firebase]', {
        code: details.code || null,
        message: details.message,
        path: details.path || null,
        projectId: firebaseRuntimeConfig.projectId,
        databaseId: firebaseRuntimeConfig.databaseId,
        error: err,
      });
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setInfoMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Informe um e-mail corporativo válido no campo acima para redefinir a senha.');
      return;
    }

    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setInfoMessage(
        'Se o e-mail estiver cadastrado, enviamos um link para redefinição de senha.'
      );
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
        setError(
          'Muitas solicitações seguidas. Aguarde alguns minutos antes de tentar novamente.'
        );
      } else {
        setInfoMessage(
          'Se o e-mail estiver cadastrado, enviamos um link para redefinição de senha.'
        );
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--surface-bg)] text-[var(--text-primary)]">
      {/* Painel esquerdo institucional (visível no computador) */}
      <aside
        className="hidden lg:flex relative flex-col justify-between p-12 xl:p-16 text-white overflow-hidden"
        style={{ background: 'var(--brand-gradient)' }}
      >
        {/* Formas geométricas sutis inspiradas nos losangos do logo */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 h-80 w-80 rotate-45 rounded-[28px] border-[18px] border-white/10" />
          <div className="absolute bottom-12 -left-24 h-72 w-72 rotate-45 rounded-[26px] border-[16px] border-white/10" />
          <div className="absolute bottom-28 left-12 h-56 w-56 rotate-45 rounded-[22px] border-[14px] border-white/10" />
        </div>

        <div className="relative z-10">
          <AmetaLogo variant="card" size="lg" />
        </div>

        <div className="relative z-10 max-w-md space-y-4">
          <h2 className="font-display text-3xl xl:text-4xl font-bold leading-tight tracking-tight text-balance">
            Gestão integrada de prestadores de serviço.
          </h2>
          <p className="text-[15px] leading-relaxed text-white/85">
            Consulte cadastros em tempo real, acompanhe conferências documentais e emita Termos de
            Autorização de Desconto com segurança e rastreabilidade.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/80">
          <ShieldCheck className="h-4 w-4 text-white shrink-0" aria-hidden="true" />
          <span>Acesso exclusivo para equipe autorizada da Ameta Serviços</span>
        </div>
      </aside>

      {/* Coluna direita: cartão de login */}
      <div className="flex flex-col min-h-screen">
        <header className="w-full px-5 sm:px-8 py-4 flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-card)]">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--brand-royal)] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Formulário público</span>
          </a>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </header>

        <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 animate-page-enter">
          <div className="w-full max-w-[440px] bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] shadow-[var(--shadow-card)] p-6 sm:p-9">
            <div className="mb-7 text-center lg:text-left">
              <div className="inline-flex lg:hidden justify-center mb-5">
                <AmetaLogo variant="card" size="md" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Acesso Administrativo
              </h1>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                Entre com seu e-mail corporativo e senha para abrir o painel.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-[10px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3.5 py-3 text-sm text-[var(--status-error)] flex items-start gap-2.5"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {infoMessage && (
                <div
                  role="status"
                  className="rounded-[10px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3.5 py-3 text-sm text-[var(--status-success)] flex items-start gap-2.5"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{infoMessage}</span>
                </div>
              )}

              <div className="group">
                <label
                  htmlFor="admin-email"
                  className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5 transition-colors group-focus-within:text-[var(--brand-royal)]"
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
                  className="w-full min-h-[46px] px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-3 focus:ring-[var(--brand-royal)]/15 focus:border-[var(--brand-royal)]"
                />
              </div>

              <div className="group">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <label
                    htmlFor="admin-password"
                    className="block text-[13px] font-semibold text-[var(--text-primary)] transition-colors group-focus-within:text-[var(--brand-royal)]"
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => void handlePasswordReset()}
                    className="text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8FA2FF] hover:underline disabled:opacity-50"
                  >
                    {resetting ? 'Enviando...' : 'Esqueci minha senha'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[46px] pl-3.5 pr-12 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] transition-all focus:outline-none focus:ring-3 focus:ring-[var(--brand-royal)]/15 focus:border-[var(--brand-royal)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="ameta-btn-interactive w-full min-h-[48px] mt-2 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] active:bg-[#172368] text-white font-semibold text-sm shadow-[0_6px_18px_-6px_rgba(31,46,133,0.4)] inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <span>Entrar</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
