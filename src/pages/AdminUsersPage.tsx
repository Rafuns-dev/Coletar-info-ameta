import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminLayout } from '../components/AdminLayout.tsx';
import { AnimatedCounter } from '../components/AnimatedCounter.tsx';
import { useToast } from '../components/ToastProvider.tsx';
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
  const { showToast } = useToast();

  const [users, setUsers] = useState<PanelUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PanelUserRole>('operador');
  const [passwordMode, setPasswordMode] = useState<'email' | 'manual'>('email');
  const [initialPassword, setInitialPassword] = useState('');
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | PanelUserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ativo' | 'inativo'>('ALL');

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
      const msg = created.passwordSetupEmailSent
        ? `Acesso criado para ${created.nome} (${created.email}). Um e-mail automático foi enviado para definir a senha.`
        : `Acesso criado para ${created.nome} (${created.email}) com a senha inicial definida. A pessoa já pode entrar no painel.`;
      setSuccessMsg(msg);
      showToast(`Acesso criado para ${created.nome}.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('email-already-in-use')) {
        setError(
          'Este e-mail já possui uma conta cadastrada no Firebase Authentication. Caso tenha removido o acesso anteriormente, utilize outro e-mail ou recrie o documento na coleção usuarios do Firestore.'
        );
      } else if (
        msg.includes('weak-password') ||
        msg.includes('password-does-not-meet-requirements')
      ) {
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
      const msg = !target.ativo
        ? `Acesso de ${target.nome} reativado.`
        : `Acesso de ${target.nome} desativado.`;
      setSuccessMsg(msg);
      showToast(msg, 'info');
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
      const msg = `Perfil de ${target.nome} alterado para ${
        newRole === 'admin' ? 'Administrador' : 'Operador'
      }.`;
      setSuccessMsg(msg);
      showToast(msg, 'success');
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
      const msg = `Nome atualizado para ${parsed.data.nome}.`;
      setSuccessMsg(msg);
      showToast(msg, 'success');
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
      const msg = `E-mail para definir/redefinir senha enviado para ${target.email}.`;
      setSuccessMsg(msg);
      showToast(msg, 'info');
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
      const msg = `Acesso de ${target.nome} removido do painel.`;
      setSuccessMsg(msg);
      showToast(msg, 'info');
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao remover acesso.'));
    } finally {
      setBusyUid(null);
    }
  };

  const inputClass =
    'w-full h-11 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15 transition-colors';

  return (
    <AdminLayout
      user={user}
      activeNav="usuarios"
      pageTitle="Usuários e Acessos"
      pageSubtitle="Cadastre pessoas autorizadas a acessar o painel administrativo da Ameta e gerencie permissões."
      breadcrumbs={[
        { label: 'Painel Ameta', path: '/admin' },
        { label: 'Usuários' },
      ]}
      globalSearch={searchTerm}
      onGlobalSearchChange={setSearchTerm}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
        {/* Resumo numérico */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium text-[var(--text-muted)]">Total cadastrado</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              <AnimatedCounter value={stats.total} />
            </p>
          </div>
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium text-[var(--text-muted)]">Acessos ativos</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--status-success)]">
              <AnimatedCounter value={stats.ativos} />
            </p>
          </div>
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium text-[var(--text-muted)]">Administradores ativos</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#1F2E85] dark:text-[#8fa2ff]">
              <AnimatedCounter value={stats.admins} />
            </p>
          </div>
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium text-[var(--text-muted)]">Operadores ativos</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#229A9A]">
              <AnimatedCounter value={stats.operadores} />
            </p>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-[12px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error)] flex items-start justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fechar aviso de erro"
              className="hover:opacity-75"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="rounded-[12px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)] flex items-start justify-between gap-3"
          >
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              aria-label="Fechar mensagem de sucesso"
              className="hover:opacity-75"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulário de cadastro de nova pessoa */}
          <section className="xl:col-span-4 bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 sm:p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="h-8 w-8 rounded-[8px] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff] flex items-center justify-center">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>Cadastrar nova pessoa</span>
            </h2>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Cria a conta no Firebase Authentication sem desconectar sua sessão e libera o acesso no painel.
            </p>

            <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="new-user-name"
                  className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
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
                  className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
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
                  className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
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

              <div className="pt-2 border-t border-[var(--border-default)] space-y-2.5">
                <span className="block text-xs font-semibold text-[var(--text-primary)]">
                  Definição de senha
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--text-secondary)]">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={passwordMode === 'email'}
                    onChange={() => setPasswordMode('email')}
                    className="mt-0.5 accent-[#1F2E85]"
                  />
                  <span>
                    <strong className="font-semibold text-[var(--text-primary)]">
                      Enviar link por e-mail
                    </strong>
                    <span className="block text-[var(--text-muted)]">
                      A pessoa recebe um e-mail do Firebase para criar a própria senha.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--text-secondary)]">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={passwordMode === 'manual'}
                    onChange={() => setPasswordMode('manual')}
                    className="mt-0.5 accent-[#1F2E85]"
                  />
                  <span>
                    <strong className="font-semibold text-[var(--text-primary)]">
                      Definir senha inicial agora
                    </strong>
                    <span className="block text-[var(--text-muted)]">
                      Libera login imediato com uma senha provisória (mínimo 10 caracteres).
                    </span>
                  </span>
                </label>

                {passwordMode === 'manual' && (
                  <div className="pt-1">
                    <label
                      htmlFor="new-user-password"
                      className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
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
                        className={`${inputClass} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowInitialPassword((prev) => !prev)}
                        aria-label={showInitialPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
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
                className="ameta-btn-interactive w-full h-11 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
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
          <section className="xl:col-span-8 bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
            <div className="p-4 sm:p-5 border-b border-[var(--border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search
                  className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  aria-label="Buscar pessoas cadastradas"
                  className="w-full h-10 pl-10 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label="Filtrar por perfil"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'ALL' | PanelUserRole)}
                  className="h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-medium text-[var(--text-primary)]"
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
                  className="h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-medium text-[var(--text-primary)]"
                >
                  <option value="ALL">Todas as situações</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-[10px] bg-[var(--surface-subtle)] animate-pulse"
                  />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Nenhuma pessoa encontrada
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Ajuste os filtros ou utilize o formulário ao lado para liberar um novo acesso.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-default)]">
                {filteredUsers.map((item) => {
                  const isSelf = item.uid === user.uid;
                  const isBusy = busyUid === item.uid;
                  const isEditing = editingUid === item.uid;
                  const isConfirmingDelete = confirmDeleteUid === item.uid;

                  return (
                    <li
                      key={item.uid}
                      className="p-4 sm:px-5 flex flex-col gap-3 hover:bg-[var(--surface-hover)] transition-colors"
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
                                className="h-9 flex-1 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs text-[var(--text-primary)]"
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveNameEdit(item)}
                                title="Salvar nome"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#1E9E6A] text-white hover:opacity-90 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUid(null)}
                                title="Cancelar edição"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">
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
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                              >
                                <Pencil className="h-3 w-3" aria-hidden="true" />
                              </button>
                              {isSelf && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
                                  Você
                                </span>
                              )}
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-[6px] border ${
                                  item.ativo
                                    ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success)]'
                                    : 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error)]'
                                }`}
                              >
                                {item.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          )}

                          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
                            {item.email} · Cadastrado em {formatDateTimeBR(item.criadoEm)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          <div className="inline-flex items-center gap-1.5">
                            <Shield
                              className="h-3.5 w-3.5 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                            <select
                              aria-label={`Perfil de ${item.nome}`}
                              disabled={isSelf || isBusy}
                              value={item.role}
                              onChange={(e) =>
                                void handleChangeRole(item, e.target.value as PanelUserRole)
                              }
                              className="h-9 px-2.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
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
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 whitespace-nowrap"
                          >
                            <Mail className="h-3.5 w-3.5 text-[#229A9A]" aria-hidden="true" />
                            <span>Enviar link de senha</span>
                          </button>

                          {/* Switch acessível para Ativar / Desativar */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.ativo}
                            aria-label={
                              item.ativo
                                ? `Desativar acesso de ${item.nome}`
                                : `Ativar acesso de ${item.nome}`
                            }
                            disabled={isSelf || isBusy}
                            onClick={() => void handleToggleActive(item)}
                            title={
                              isSelf
                                ? 'Você não pode desativar o próprio acesso'
                                : item.ativo
                                  ? 'Bloquear acesso ao painel'
                                  : 'Reativar acesso ao painel'
                            }
                            className="inline-flex h-9 items-center gap-2 px-2.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] disabled:opacity-45 whitespace-nowrap"
                          >
                            <span
                              aria-hidden="true"
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                                item.ativo ? 'bg-[#229A9A]' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                                  item.ativo ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                                }`}
                              />
                            </span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">
                              {item.ativo ? 'Ativo' : 'Inativo'}
                            </span>
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
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--status-error-border)] text-[var(--status-error)] hover:bg-[var(--status-error-bg)] disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {isConfirmingDelete && (
                        <div className="rounded-[10px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--status-error)]">
                            Confirmar remoção de <strong>{item.nome}</strong> da lista de acessos autorizados?
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(null)}
                              className="h-8 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] font-medium"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteUser(item)}
                              className="h-8 px-3 rounded-[8px] bg-[var(--status-error)] hover:opacity-90 text-white font-semibold disabled:opacity-50"
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

            <div className="px-4 sm:px-5 py-3 border-t border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#229A9A]" aria-hidden="true" />
              <span>
                Somente pessoas listadas aqui com status <strong>Ativo</strong> conseguem entrar no painel administrativo.
              </span>
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
