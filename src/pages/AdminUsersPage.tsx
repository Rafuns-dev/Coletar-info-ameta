import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import {
  createPanelUser,
  extractFriendlyFirestoreMessage,
  removePanelUser,
  resendUserPasswordSetupEmail,
  subscribeToPanelUsers,
  updatePanelUser,
} from '../services/firestoreService.ts';
import {
  panelUserCreateSchema,
  panelUserUpdateSchema,
  type PanelUserProfile,
  type PanelUserRole,
} from '../shared/schema.ts';
import { formatDateTimeBR } from '../shared/validators.ts';

interface AdminUsersPageProps {
  user: PanelUserProfile;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}

export function AdminUsersPage({
  user,
  isDark,
  onToggleTheme,
  onLogout,
  onNavigate,
}: AdminUsersPageProps) {
  const [users, setUsers] = useState<PanelUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulário de cadastro de acesso
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PanelUserRole>('operador');
  const [passwordMode, setPasswordMode] = useState<'email' | 'manual'>('email');
  const [initialPassword, setInitialPassword] = useState('');
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Filtros e busca da lista
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | PanelUserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ativo' | 'inativo'>('ALL');

  // Edição inline de nome e confirmação de remoção
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPanelUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        setError(extractFriendlyFirestoreMessage(err, 'Erro ao carregar usuários do painel.'));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const total = users.length;
    const ativos = users.filter((u) => u.ativo).length;
    const admins = users.filter((u) => u.role === 'admin' && u.ativo).length;
    const operadores = users.filter((u) => u.role === 'operador' && u.ativo).length;
    return { total, ativos, admins, operadores };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users.filter((item) => {
      if (roleFilter !== 'ALL' && item.role !== roleFilter) return false;
      if (statusFilter === 'ativo' && !item.ativo) return false;
      if (statusFilter === 'inativo' && item.ativo) return false;
      if (q) {
        const matchesName = item.nome.toLowerCase().includes(q);
        const matchesEmail = item.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const parsed = panelUserCreateSchema.safeParse({
      nome,
      email,
      role,
      passwordMode,
      initialPassword: passwordMode === 'manual' ? initialPassword : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Verifique os dados informados.');
      return;
    }

    setCreating(true);
    try {
      const created = await createPanelUser({
        nome: parsed.data.nome,
        email: parsed.data.email,
        role: parsed.data.role,
        initialPassword:
          parsed.data.passwordMode === 'manual' ? parsed.data.initialPassword : undefined,
        actor: user,
      });
      setNome('');
      setEmail('');
      setRole('operador');
      setInitialPassword('');
      setShowInitialPassword(false);
      setSuccessMsg(
        created.passwordSetupEmailSent
          ? `Acesso criado para ${created.nome} (${created.email}). Um e-mail automático foi enviado para definir a senha.`
          : `Acesso criado para ${created.nome} (${created.email}) com a senha inicial definida. A pessoa já pode entrar no painel.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('email-already-in-use')) {
        setError(
          'Este e-mail já possui uma conta cadastrada no Firebase Authentication. Caso tenha removido o acesso anteriormente, utilize outro e-mail ou recrie o documento na coleção usuarios do Firestore.'
        );
      } else if (msg.includes('weak-password') || msg.includes('password-does-not-meet-requirements')) {
        setError(
          'A senha não atende à política de segurança configurada no Firebase Authentication (use pelo menos 10 caracteres com letras e números).'
        );
      } else {
        setError(extractFriendlyFirestoreMessage(err, 'Não foi possível cadastrar o acesso.'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (target: PanelUserProfile) => {
    if (target.uid === user.uid) return;
    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await updatePanelUser({
        targetUid: target.uid,
        nome: target.nome,
        email: target.email,
        role: target.role,
        ativo: !target.ativo,
        actor: user,
      });
      setSuccessMsg(
        !target.ativo
          ? `Acesso de ${target.nome} reativado.`
          : `Acesso de ${target.nome} desativado.`
      );
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao atualizar situação do usuário.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleChangeRole = async (target: PanelUserProfile, newRole: PanelUserRole) => {
    if (target.uid === user.uid || target.role === newRole) return;
    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await updatePanelUser({
        targetUid: target.uid,
        nome: target.nome,
        email: target.email,
        role: newRole,
        ativo: target.ativo,
        actor: user,
      });
      setSuccessMsg(
        `Perfil de ${target.nome} alterado para ${newRole === 'admin' ? 'Administrador' : 'Operador'}.`
      );
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao alterar perfil do usuário.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveNameEdit = async (target: PanelUserProfile) => {
    const parsed = panelUserUpdateSchema.safeParse({
      nome: editingName,
      role: target.role,
      ativo: target.ativo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Nome inválido.');
      return;
    }

    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await updatePanelUser({
        targetUid: target.uid,
        nome: parsed.data.nome,
        email: target.email,
        role: target.role,
        ativo: target.ativo,
        actor: user,
      });
      setEditingUid(null);
      setSuccessMsg(`Nome atualizado para ${parsed.data.nome}.`);
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao salvar nome do usuário.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleResendPasswordEmail = async (target: PanelUserProfile) => {
    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await resendUserPasswordSetupEmail(target.email);
      setSuccessMsg(`E-mail para definir/redefinir senha enviado para ${target.email}.`);
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao enviar e-mail de senha.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeleteUser = async (target: PanelUserProfile) => {
    if (target.uid === user.uid) return;
    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await removePanelUser({
        targetUid: target.uid,
        targetName: target.nome,
        targetEmail: target.email,
        actor: user,
      });
      setConfirmDeleteUid(null);
      setSuccessMsg(`Acesso de ${target.nome} removido do painel.`);
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao remover acesso.'));
    } finally {
      setBusyUid(null);
    }
  };

  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20 dark:focus:ring-slate-400/20';

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/admin');
              }}
              className="shrink-0"
            >
              <AmetaLogo size="sm" />
            </a>
            <nav aria-label="Navegação administrativa" className="hidden sm:flex items-center gap-1 ml-2">
              <a
                href="/admin"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/admin');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cadastros
              </a>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0F2942] text-white dark:bg-slate-100 dark:text-[#0F2942]">
                Usuários e Acessos
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {user.nome} · Administrador
            </span>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Formulário</span>
            </a>
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Cabeçalho da página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Voltar para Cadastros</span>
            </button>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <Users className="h-6 w-6 text-[#0F2942] dark:text-slate-200" aria-hidden="true" />
              <span>Cadastro de Usuários e Acessos</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Cadastre pessoas autorizadas a acessar o painel administrativo da Ameta e gerencie permissões.
            </p>
          </div>
        </div>

        {/* Resumo numérico */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total cadastrado
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.total}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Acessos ativos
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {stats.ativos}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Administradores ativos
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F2942] dark:text-slate-100">
              {stats.admins}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Operadores ativos
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {stats.operadores}
            </p>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fechar aviso de erro"
              className="text-red-600 dark:text-red-300 hover:opacity-75"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-3"
          >
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              aria-label="Fechar mensagem de sucesso"
              className="text-emerald-700 dark:text-emerald-300 hover:opacity-75"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulário de cadastro de nova pessoa */}
          <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#0F2942] dark:text-slate-200" aria-hidden="true" />
              <span>Cadastrar nova pessoa</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cria a conta no Firebase Authentication sem desconectar sua sessão e libera o acesso no painel.
            </p>

            <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="new-user-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome completo
                </label>
                <input
                  id="new-user-name"
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Ana Paula Souza"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new-user-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  E-mail de acesso
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ana@ameta.com.br"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new-user-role"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Perfil de acesso
                </label>
                <select
                  id="new-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as PanelUserRole)}
                  className={inputClass}
                >
                  <option value="operador">Operador — consulta, altera status/obs. e gera termos</option>
                  <option value="admin">Administrador — acesso total e gestão de usuários</option>
                </select>
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Definição de senha
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={passwordMode === 'email'}
                    onChange={() => setPasswordMode('email')}
                    className="mt-0.5 accent-[#0F2942]"
                  />
                  <span>
                    <strong className="font-semibold">Enviar link por e-mail</strong>
                    <span className="block text-slate-500 dark:text-slate-400">
                      A pessoa recebe um e-mail do Firebase para criar a própria senha.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={passwordMode === 'manual'}
                    onChange={() => setPasswordMode('manual')}
                    className="mt-0.5 accent-[#0F2942]"
                  />
                  <span>
                    <strong className="font-semibold">Definir senha inicial agora</strong>
                    <span className="block text-slate-500 dark:text-slate-400">
                      Libera login imediato com uma senha provisória (mínimo 10 caracteres).
                    </span>
                  </span>
                </label>

                {passwordMode === 'manual' && (
                  <div className="pt-1">
                    <label
                      htmlFor="new-user-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Senha inicial (mínimo 10 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        id="new-user-password"
                        type={showInitialPassword ? 'text' : 'password'}
                        required
                        minLength={10}
                        value={initialPassword}
                        onChange={(e) => setInitialPassword(e.target.value)}
                        placeholder="Ex: Ameta@2026!01"
                        className={`${inputClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowInitialPassword((prev) => !prev)}
                        aria-label={showInitialPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {showInitialPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full h-10 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-white dark:text-[#0F2942] text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Cadastrando acesso...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    <span>Cadastrar pessoa</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Lista de pessoas com acesso */}
          <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search
                  className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  aria-label="Buscar pessoas cadastradas"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label="Filtrar por perfil"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'ALL' | PanelUserRole)}
                  className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">Todos os perfis</option>
                  <option value="admin">Administrador</option>
                  <option value="operador">Operador</option>
                </select>

                <select
                  aria-label="Filtrar por situação"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'ALL' | 'ativo' | 'inativo')
                  }
                  className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">Todas as situações</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Carregando pessoas com acesso...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Nenhuma pessoa encontrada
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ajuste os filtros ou utilize o formulário ao lado para liberar um novo acesso.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((item) => {
                  const isSelf = item.uid === user.uid;
                  const isBusy = busyUid === item.uid;
                  const isEditing = editingUid === item.uid;
                  const isConfirmingDelete = confirmDeleteUid === item.uid;

                  return (
                    <li
                      key={item.uid}
                      className="p-4 sm:px-5 flex flex-col gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2 max-w-sm">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                aria-label="Editar nome completo"
                                className="h-8 flex-1 px-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveNameEdit(item)}
                                title="Salvar nome"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUid(null)}
                                title="Cancelar edição"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {item.nome}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUid(item.uid);
                                  setEditingName(item.nome);
                                }}
                                title="Editar nome"
                                aria-label={`Editar nome de ${item.nome}`}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-3 w-3" aria-hidden="true" />
                              </button>
                              {isSelf && (
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                  Você
                                </span>
                              )}
                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                                  item.ativo
                                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                    : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                                }`}
                              >
                                {item.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          )}

                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {item.email} · Cadastrado em {formatDateTimeBR(item.criadoEm)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <div className="inline-flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <select
                              aria-label={`Perfil de ${item.nome}`}
                              disabled={isSelf || isBusy}
                              value={item.role}
                              onChange={(e) =>
                                void handleChangeRole(item, e.target.value as PanelUserRole)
                              }
                              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
                            >
                              <option value="operador">Operador</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleResendPasswordEmail(item)}
                            title="Enviar e-mail para definir ou redefinir senha"
                            className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Enviar link de senha</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf || isBusy}
                            onClick={() => void handleToggleActive(item)}
                            title={
                              isSelf
                                ? 'Você não pode desativar o próprio acesso'
                                : item.ativo
                                  ? 'Bloquear acesso ao painel'
                                  : 'Reativar acesso ao painel'
                            }
                            className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                          >
                            {item.ativo ? (
                              <>
                                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Desativar</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Ativar</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isSelf || isBusy}
                            onClick={() =>
                              setConfirmDeleteUid(isConfirmingDelete ? null : item.uid)
                            }
                            title={
                              isSelf
                                ? 'Você não pode remover seu próprio acesso'
                                : 'Remover acesso do painel'
                            }
                            aria-label={`Remover ${item.nome}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {isConfirmingDelete && (
                        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <span className="text-red-800 dark:text-red-200">
                            Confirmar remoção de <strong>{item.nome}</strong> da lista de acessos autorizados?
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(null)}
                              className="h-7 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteUser(item)}
                              className="h-7 px-2.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
                            >
                              {isBusy ? 'Removendo...' : 'Confirmar remoção'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Somente pessoas listadas aqui com status <strong>Ativo</strong> conseguem entrar no painel administrativo.
              </span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
