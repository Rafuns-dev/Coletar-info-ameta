import { Loader2, Mail, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
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
  type PanelUserProfile,
  type PanelUserRole,
} from '../shared/schema.ts';
import { formatDateTimeBR } from '../shared/validators.ts';

interface TeamManagementModalProps {
  currentUser: PanelUserProfile;
  onClose: () => void;
}

export function TeamManagementModal({ currentUser, onClose }: TeamManagementModalProps) {
  const [users, setUsers] = useState<PanelUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PanelUserRole>('operador');
  const [creating, setCreating] = useState(false);
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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const parsed = panelUserCreateSchema.safeParse({ nome, email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Verifique os dados informados.');
      return;
    }

    setCreating(true);
    try {
      await createPanelUser({
        nome: parsed.data.nome,
        email: parsed.data.email,
        role: parsed.data.role,
        actor: currentUser,
      });
      setNome('');
      setEmail('');
      setRole('operador');
      setSuccessMsg(
        'Usuário criado com sucesso. Um e-mail automático foi enviado para ele definir a própria senha.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('email-already-in-use')) {
        setError('Este e-mail já está cadastrado no Firebase Authentication.');
      } else {
        setError(extractFriendlyFirestoreMessage(err, 'Não foi possível criar o usuário.'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (target: PanelUserProfile) => {
    if (target.uid === currentUser.uid) return;
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
        actor: currentUser,
      });
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao atualizar status do usuário.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleChangeRole = async (target: PanelUserProfile, newRole: PanelUserRole) => {
    if (target.uid === currentUser.uid) return;
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
        actor: currentUser,
      });
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao alterar perfil do usuário.'));
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
      setSuccessMsg(`E-mail de definição de senha reenviado para ${target.email}.`);
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao reenviar e-mail de senha.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeleteUser = async (target: PanelUserProfile) => {
    if (target.uid === currentUser.uid) return;
    setBusyUid(target.uid);
    setError(null);
    setSuccessMsg(null);
    try {
      await removePanelUser({
        targetUid: target.uid,
        targetName: target.nome,
        targetEmail: target.email,
        actor: currentUser,
      });
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao remover acesso.'));
    } finally {
      setBusyUid(null);
    }
  };

  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-950/65"
    >
      <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-[#0F2942] dark:text-slate-200" aria-hidden="true" />
            <div>
              <h2
                id="team-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Usuários do Painel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Administradores gerenciam usuários e excluem registros; Operadores consultam, atualizam status/observações e geram termos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de usuários"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
            >
              {successMsg}
            </div>
          )}

          <form
            onSubmit={handleCreateUser}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-4"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Criar novo usuário</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nome completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Ana Souza"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  E-mail de login
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ana@ameta.com.br"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Perfil
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PanelUserRole)}
                  className={inputClass}
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ao criar o usuário, enviaremos um e-mail automático para que ele defina a própria senha sem desconectar você.
              </p>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Criando e enviando convite...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Criar usuário</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Usuários cadastrados ({users.length})
            </h3>

            {loading ? (
              <div className="py-6 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Carregando usuários...</span>
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum usuário cadastrado em /usuarios.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {users.map((item) => {
                  const isSelf = item.uid === currentUser.uid;
                  const isBusy = busyUid === item.uid;
                  return (
                    <li
                      key={item.uid}
                      className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.nome}
                          </span>
                          {isSelf && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                              Você
                            </span>
                          )}
                          {!item.ativo && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                              Inativo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.email} · Criado em {formatDateTimeBR(item.criadoEm)}
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
                            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
                          >
                            <option value="operador">Operador</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleResendPasswordEmail(item)}
                          title="Enviar e-mail para definir/redefinir senha"
                          className="inline-flex h-9 items-center gap-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Redefinir senha</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSelf || isBusy}
                          onClick={() => void handleToggleActive(item)}
                          title={
                            isSelf
                              ? 'Você não pode desativar o próprio acesso'
                              : item.ativo
                                ? 'Desativar acesso'
                                : 'Ativar acesso'
                          }
                          className="inline-flex h-9 items-center px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {item.ativo ? 'Desativar' : 'Ativar'}
                        </button>

                        <button
                          type="button"
                          disabled={isSelf || isBusy}
                          onClick={() => void handleDeleteUser(item)}
                          title={
                            isSelf
                              ? 'Você não pode remover seu próprio acesso'
                              : 'Remover acesso do painel'
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
