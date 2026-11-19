import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  FileText,
  History,
  Loader2,
  Pencil,
  Save,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  deleteCadastroWithCascade,
  extractFriendlyFirestoreMessage,
  getCadastroById,
  markCadastroUnseen,
  markCadastroViewed,
  recordTermRedownloadAudit,
  subscribeToAuditoriaByCadastro,
  subscribeToTermosByCadastro,
  updateCadastroFull,
  updateCadastroNotes,
  updateCadastroStatus,
} from '../services/firestoreService.ts';
import {
  MARITAL_STATUS_OPTIONS,
  REGISTRATION_STATUS_OPTIONS,
  ROLE_OPTIONS,
  type RegistrationStatus,
} from '../shared/formConfig.ts';
import {
  contractorRegistrationSchema,
  type AuditLogItem,
  type ContractorRegistrationDetail,
  type ContractorRegistrationInput,
  type DiscountTermHistoryItem,
  type PanelUserProfile,
} from '../shared/schema.ts';
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatDateBR,
  formatDateTimeBR,
  formatPhone,
} from '../shared/validators.ts';
import { exportDiscountTermToDocx } from '../utils/discountTermDocx.ts';
import { exportDiscountTermToPdf } from '../utils/discountTermPdf.ts';
import {
  exportRegistrationToPdf,
  formatRegistrationAsText,
} from '../utils/pdfExport.ts';
import { DiscountTermModal } from './DiscountTermModal.tsx';
import { useToast } from './ToastProvider.tsx';

interface RegistrationFullscreenModalProps {
  registrationId: string;
  orderedIds: string[];
  currentUser: PanelUserProfile;
  onClose: () => void;
  onSelectId: (id: string) => void;
}

interface FieldBlockItem {
  key: keyof ContractorRegistrationInput;
  label: string;
  mono?: boolean;
  isDate?: boolean;
}

const FIELD_BLOCKS: Array<{ title: string; fields: FieldBlockItem[] }> = [
  {
    title: 'Dados pessoais',
    fields: [
      { key: 'registrationDate', label: 'Data da Cadastro', mono: true, isDate: true },
      { key: 'role', label: 'Qual será a sua função na empresa' },
      { key: 'fullName', label: 'Nome Completo' },
      { key: 'cpf', label: 'Informe seu CPF', mono: true },
      { key: 'rg', label: 'Informe seu RG', mono: true },
      { key: 'birthPlace', label: 'Informe sua Naturalidade' },
      { key: 'nationality', label: 'Informe sua Nacionalidade' },
      { key: 'maritalStatus', label: 'Estado Civil' },
      { key: 'birthDate', label: 'DATA DE NASCIMENTO', mono: true, isDate: true },
    ],
  },
  {
    title: 'Empresa',
    fields: [
      { key: 'cnpj', label: 'Informe o CNPJ de sua empresa', mono: true },
      { key: 'companyAddress', label: 'Informe endereço da sua empresa' },
      { key: 'companyCep', label: 'Informe o CEP da sua empresa', mono: true },
    ],
  },
  {
    title: 'Filiação',
    fields: [
      { key: 'fatherName', label: 'Nome completo do Pai' },
      { key: 'motherName', label: 'Nome completo da Mãe' },
    ],
  },
  {
    title: 'Contato',
    fields: [
      { key: 'email', label: 'Informe seu Email' },
      { key: 'phone', label: 'Informe o seu Telefone com DDD', mono: true },
    ],
  },
];

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function getStatusPillStyle(status: RegistrationStatus): string {
  switch (status) {
    case 'Novo':
      return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)]';
    case 'Em análise':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
    case 'Dados conferidos':
      return 'border-[#229A9A]/40 bg-[#229A9A]/12 text-[#1b8181] dark:text-[#5eead4]';
    case 'Concluído':
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success)]';
    default:
      return 'border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]';
  }
}

export function RegistrationFullscreenModal({
  registrationId,
  orderedIds,
  currentUser,
  onClose,
  onSelectId,
}: RegistrationFullscreenModalProps) {
  const { showToast } = useToast();

  const [record, setRecord] = useState<ContractorRegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedFieldKey, setCopiedFieldKey] = useState<string | null>(null);

  const [statusValue, setStatusValue] = useState<RegistrationStatus>('Novo');
  const [notesValue, setNotesValue] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSavedMessage, setMetaSavedMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saveEditError, setSaveEditError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [termModalOpen, setTermModalOpen] = useState(false);
  const [terms, setTerms] = useState<DiscountTermHistoryItem[]>([]);
  const [expandedTermIds, setExpandedTermIds] = useState<Record<string, boolean>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [redownloadingKey, setRedownloadingKey] = useState<string | null>(null);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const currentIndex = orderedIds.indexOf(registrationId);
  const prevId = currentIndex > 0 ? orderedIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < orderedIds.length - 1
      ? orderedIds[currentIndex + 1]
      : null;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContractorRegistrationInput>({
    resolver: zodResolver(contractorRegistrationSchema),
  });

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsEditing(false);
    setMetaSavedMessage(null);

    try {
      const reg = await getCadastroById(registrationId);
      if (!reg) {
        setRecord(null);
        setError('Cadastro não encontrado.');
        return;
      }

      setRecord(reg);
      setStatusValue(reg.status);
      setNotesValue(reg.internalNotes || '');
      reset({
        registrationDate: reg.registrationDate,
        role: reg.role,
        fullName: reg.fullName,
        cpf: reg.cpf,
        rg: reg.rg,
        birthPlace: reg.birthPlace,
        nationality: reg.nationality,
        maritalStatus: reg.maritalStatus,
        birthDate: reg.birthDate,
        cnpj: reg.cnpj,
        companyAddress: reg.companyAddress,
        companyCep: reg.companyCep,
        fatherName: reg.fatherName,
        motherName: reg.motherName,
        email: reg.email,
        phone: reg.phone,
      });

      void markCadastroViewed(reg.id, reg.viewed, currentUserRef.current).catch(() => {});
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao carregar cadastro.'));
    } finally {
      setLoading(false);
    }
  }, [registrationId, reset]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    setLoadingTerms(true);
    const unsubTermos = subscribeToTermosByCadastro(
      registrationId,
      (list) => {
        setTerms(list);
        setLoadingTerms(false);
      },
      () => {
        setLoadingTerms(false);
      }
    );

    let unsubAuditoria = () => {};
    if (currentUser.role === 'admin') {
      unsubAuditoria = subscribeToAuditoriaByCadastro(
        registrationId,
        (logs) => {
          setAuditLogs(logs);
        },
        () => {}
      );
    } else {
      setAuditLogs([]);
    }

    return () => {
      unsubTermos();
      unsubAuditoria();
    };
  }, [registrationId, currentUser.role]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (termModalOpen) {
          setTermModalOpen(false);
          return;
        }
        if (confirmDeleteOpen) {
          setConfirmDeleteOpen(false);
          return;
        }
        onClose();
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isTyping || isEditing || termModalOpen) return;

      if (e.key === 'ArrowLeft' && prevId) {
        e.preventDefault();
        onSelectId(prevId);
      } else if (e.key === 'ArrowRight' && nextId) {
        e.preventDefault();
        onSelectId(nextId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevId, nextId, onSelectId, isEditing, confirmDeleteOpen, termModalOpen]);

  const handleCopyAll = async () => {
    if (!record) return;
    await copyText(formatRegistrationAsText(record));
    setCopiedAll(true);
    showToast('Todos os dados do cadastro foram copiados.');
    window.setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopyField = async (key: string, label: string, value: string) => {
    await copyText(value);
    setCopiedFieldKey(key);
    showToast(`${label} copiado.`);
    window.setTimeout(() => setCopiedFieldKey((prev) => (prev === key ? null : prev)), 1600);
  };

  const handleStatusChange = async (newStatus: RegistrationStatus) => {
    if (!record) return;
    const prev = record.status;
    setStatusValue(newStatus);
    setSavingMeta(true);
    setMetaSavedMessage(null);
    try {
      await updateCadastroStatus(record.id, prev, newStatus, currentUser);
      setRecord({ ...record, status: newStatus });
      setMetaSavedMessage('Status atualizado');
      showToast(`Status alterado para "${newStatus}".`);
    } catch {
      setStatusValue(prev);
      showToast('Não foi possível alterar o status.', 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!record) return;
    setSavingMeta(true);
    setMetaSavedMessage(null);
    try {
      await updateCadastroNotes(record.id, notesValue, currentUser);
      setRecord({ ...record, internalNotes: notesValue });
      setMetaSavedMessage('Observações salvas');
      showToast('Observações internas salvas.');
    } catch {
      showToast('Erro ao salvar observações.', 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleMarkUnseen = async () => {
    if (!record) return;
    setSavingMeta(true);
    try {
      await markCadastroUnseen(record.id, currentUser);
      showToast('Cadastro marcado como não visto.', 'info');
      onClose();
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveEdit = async (data: ContractorRegistrationInput) => {
    if (!record) return;
    setSaveEditError(null);
    try {
      await updateCadastroFull(record.id, data, currentUser);
      const refreshed = await getCadastroById(record.id);
      if (refreshed) {
        setRecord(refreshed);
      }
      setIsEditing(false);
      showToast('Alterações cadastrais salvas com sucesso.');
    } catch (err) {
      setSaveEditError(extractFriendlyFirestoreMessage(err, 'Erro ao salvar alterações.'));
    }
  };

  const handleRedownloadDocx = async (term: DiscountTermHistoryItem) => {
    setRedownloadingKey(`${term.id}:docx`);
    try {
      await exportDiscountTermToDocx(
        term.templateFields,
        term.contractorCompanyName || record?.fullName,
        term.selectedDocuments
      );
      await recordTermRedownloadAudit({
        cadastroId: registrationId,
        termoId: term.id,
        format: 'docx',
        actor: currentUser,
      });
      showToast('Termo em Word (.docx) baixado novamente.');
    } finally {
      setRedownloadingKey(null);
    }
  };

  const handleRedownloadPdf = async (term: DiscountTermHistoryItem) => {
    setRedownloadingKey(`${term.id}:pdf`);
    try {
      exportDiscountTermToPdf(
        term.templateFields,
        term.contractorCompanyName || record?.fullName,
        term.selectedDocuments
      );
      await recordTermRedownloadAudit({
        cadastroId: registrationId,
        termoId: term.id,
        format: 'pdf',
        actor: currentUser,
      });
      showToast('Termo em PDF baixado novamente.');
    } finally {
      setRedownloadingKey(null);
    }
  };

  const handleDelete = async () => {
    if (!record || currentUser.role !== 'admin') return;
    setIsDeleting(true);
    try {
      await deleteCadastroWithCascade(record.id, record.fullName, currentUser);
      showToast(`Cadastro de ${record.fullName} excluído.`, 'info');
      if (nextId) {
        onSelectId(nextId);
      } else if (prevId) {
        onSelectId(prevId);
      } else {
        onClose();
      }
    } catch (err) {
      setError(extractFriendlyFirestoreMessage(err, 'Erro ao excluir cadastro.'));
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const editInputClass =
    'w-full h-11 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15';

  const isAdmin = currentUser.role === 'admin';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização completa do cadastro"
      className="fixed inset-0 z-50 bg-[var(--surface-bg)] text-[var(--text-primary)] overflow-y-auto flex flex-col animate-modal-expand"
    >
      {/* Cabeçalho fixo */}
      <header className="sticky top-0 z-20 bg-[var(--surface-card)]/95 backdrop-blur-sm border-b border-[var(--border-default)] px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar visualização (Esc)"
              title="Fechar (Esc)"
              className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Fechar</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!prevId}
                onClick={() => prevId && onSelectId(prevId)}
                title="Cadastro anterior (Seta esquerda)"
                aria-label="Cadastro anterior"
                className="ameta-btn-interactive inline-flex h-10 items-center gap-1 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              {currentIndex >= 0 && (
                <span className="px-2 text-xs tabular-nums font-medium text-[var(--text-secondary)] whitespace-nowrap">
                  {currentIndex + 1} de {orderedIds.length}
                </span>
              )}

              <button
                type="button"
                disabled={!nextId}
                onClick={() => nextId && onSelectId(nextId)}
                title="Próximo cadastro (Seta direita)"
                aria-label="Próximo cadastro"
                className="ameta-btn-interactive inline-flex h-10 items-center gap-1 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="hidden sm:inline">Próximo</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {record && !isEditing && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTermModalOpen(true)}
                className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-4 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white shadow-sm whitespace-nowrap"
              >
                <ScrollText className="h-3.5 w-3.5 text-[#5eead4]" aria-hidden="true" />
                <span>Gerar Termo de Autorização de Desconto</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAll}
                className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] whitespace-nowrap"
              >
                {copiedAll ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--status-success)]" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                    <span>Copiar dados</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  exportRegistrationToPdf(record);
                  showToast('PDF da ficha gerado.');
                }}
                className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                  <span className="hidden md:inline">Editar</span>
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="ameta-btn-interactive inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--status-error-border)] bg-[var(--surface-card)] text-xs font-medium text-[var(--status-error)] hover:bg-[var(--status-error-bg)] whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">Excluir</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-8 animate-pulse space-y-4">
            <div className="h-7 w-72 bg-[var(--surface-subtle)] rounded" />
            <div className="h-4 w-52 bg-[var(--surface-subtle)] rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-14 bg-[var(--surface-subtle)] rounded-[10px]" />
              ))}
            </div>
          </div>
        ) : error || !record ? (
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-10 text-center">
            <p className="text-sm text-[var(--status-error)]">
              {error || 'Cadastro não encontrado.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex h-10 items-center px-4 rounded-[10px] bg-[#1F2E85] text-white text-xs font-semibold"
            >
              Voltar à lista
            </button>
          </div>
        ) : isEditing ? (
          <form
            onSubmit={handleSubmit(handleSaveEdit)}
            className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-6 sm:p-8 space-y-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-default)]">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Editar Ficha Cadastral
              </h2>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSaveEditError(null);
                  setIsEditing(false);
                }}
                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancelar</span>
              </button>
            </div>

            {saveEditError && (
              <div className="rounded-[10px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error)]">
                {saveEditError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Data da Cadastro
                </label>
                <input
                  type="date"
                  className={`${editInputClass} tabular-nums`}
                  {...register('registrationDate')}
                />
                {errors.registrationDate && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.registrationDate.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Qual será a sua função na empresa
                </label>
                <select className={editInputClass} {...register('role')}>
                  <option value="">Selecionar sua resposta</option>
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.role && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.role.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Nome Completo
                </label>
                <input type="text" className={editInputClass} {...register('fullName')} />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.fullName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe seu CPF
                </label>
                <Controller
                  name="cpf"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="text"
                      maxLength={14}
                      className={`${editInputClass} tabular-nums`}
                      value={field.value}
                      onChange={(e) => field.onChange(formatCPF(e.target.value))}
                    />
                  )}
                />
                {errors.cpf && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.cpf.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe seu RG
                </label>
                <input
                  type="text"
                  className={`${editInputClass} tabular-nums`}
                  {...register('rg')}
                />
                {errors.rg && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.rg.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe sua Naturalidade
                </label>
                <input type="text" className={editInputClass} {...register('birthPlace')} />
                {errors.birthPlace && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.birthPlace.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe sua Nacionalidade
                </label>
                <input type="text" className={editInputClass} {...register('nationality')} />
                {errors.nationality && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.nationality.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Estado Civil
                </label>
                <select className={editInputClass} {...register('maritalStatus')}>
                  <option value="">Selecionar sua resposta</option>
                  {MARITAL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.maritalStatus && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.maritalStatus.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  DATA DE NASCIMENTO
                </label>
                <input
                  type="date"
                  className={`${editInputClass} tabular-nums`}
                  {...register('birthDate')}
                />
                {errors.birthDate && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.birthDate.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe o CNPJ de sua empresa
                </label>
                <Controller
                  name="cnpj"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="text"
                      maxLength={18}
                      className={`${editInputClass} tabular-nums`}
                      value={field.value}
                      onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                    />
                  )}
                />
                {errors.cnpj && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.cnpj.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe o CEP da sua empresa
                </label>
                <Controller
                  name="companyCep"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="text"
                      maxLength={9}
                      className={`${editInputClass} tabular-nums`}
                      value={field.value}
                      onChange={(e) => field.onChange(formatCEP(e.target.value))}
                    />
                  )}
                />
                {errors.companyCep && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.companyCep.message}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe endereço da sua empresa
                </label>
                <input type="text" className={editInputClass} {...register('companyAddress')} />
                {errors.companyAddress && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.companyAddress.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Nome completo do Pai
                </label>
                <input type="text" className={editInputClass} {...register('fatherName')} />
                {errors.fatherName && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.fatherName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Nome completo da Mãe
                </label>
                <input type="text" className={editInputClass} {...register('motherName')} />
                {errors.motherName && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {errors.motherName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe seu Email
                </label>
                <input type="email" className={editInputClass} {...register('email')} />
                {errors.email && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Informe o seu Telefone com DDD
                </label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="tel"
                      maxLength={15}
                      className={`${editInputClass} tabular-nums`}
                      value={field.value}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
                  )}
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSaveEditError(null);
                  setIsEditing(false);
                }}
                className="inline-flex h-11 items-center px-4 rounded-[10px] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-5 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Salvar alterações</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* Cartão resumo do prestador + seletor de status em 1 clique */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 sm:p-6 shadow-[var(--shadow-card)] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                    {record.fullName}
                  </h1>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-[6px] border text-[11px] font-semibold ${getStatusPillStyle(
                      statusValue
                    )}`}
                  >
                    {statusValue}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold text-[#229A9A]">{record.role}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Data da Cadastro: {formatDateBR(record.registrationDate)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Enviado em {formatDateTimeBR(record.createdAt)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="fullscreen-status-select"
                    className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap"
                  >
                    Status
                  </label>
                  <select
                    id="fullscreen-status-select"
                    value={statusValue}
                    disabled={savingMeta}
                    onChange={(e) => void handleStatusChange(e.target.value as RegistrationStatus)}
                    className="h-11 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15"
                  >
                    {REGISTRATION_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={savingMeta}
                  onClick={() => void handleMarkUnseen()}
                  className="ameta-btn-interactive inline-flex h-11 items-center gap-1.5 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] whitespace-nowrap"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Marcar não visto</span>
                </button>
              </div>
            </div>

            {/* Layout 2 colunas no desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Coluna principal: 4 blocos de campos com cópia individual */}
              <div className="lg:col-span-7 space-y-5">
                {FIELD_BLOCKS.map((block) => (
                  <section
                    key={block.title}
                    className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]"
                  >
                    <div className="px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rotate-45 bg-[#229A9A] rounded-[1px]"
                      />
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {block.title}
                      </h2>
                    </div>

                    <dl
                      className={
                        block.title === 'Dados pessoais'
                          ? 'grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-[var(--border-default)]'
                          : 'divide-y divide-[var(--border-default)]'
                      }
                    >
                      {block.fields.map((field) => {
                        const rawValue = record[field.key];
                        const displayValue = field.isDate ? formatDateBR(rawValue) : rawValue;
                        const isFieldCopied = copiedFieldKey === field.key;

                        return (
                          <div
                            key={field.key}
                            className="bg-[var(--surface-card)] px-5 py-3.5 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <dt className="text-xs font-medium text-[var(--text-muted)]">
                                {field.label}
                              </dt>
                              <dd
                                className={`mt-1 text-sm text-[var(--text-primary)] break-words ${
                                  field.mono ? 'font-mono tabular-nums' : 'font-medium'
                                }`}
                              >
                                {displayValue}
                              </dd>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyField(field.key, field.label, displayValue)
                              }
                              aria-label={`Copiar ${field.label}`}
                              title={`Copiar ${field.label}`}
                              className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                            >
                              {isFieldCopied ? (
                                <Check
                                  className="h-3.5 w-3.5 text-[var(--status-success)]"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>

              {/* Coluna lateral: Observações internas, Termos gerados, Linha do tempo */}
              <div className="lg:col-span-5 space-y-5">
                {/* Observações internas */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 shadow-[var(--shadow-card)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <label
                      htmlFor="internal-notes-textarea"
                      className="text-sm font-semibold text-[var(--text-primary)]"
                    >
                      Observações internas
                    </label>
                    {metaSavedMessage && (
                      <span className="text-xs font-semibold text-[var(--status-success)]">
                        {metaSavedMessage}
                      </span>
                    )}
                  </div>
                  <textarea
                    id="internal-notes-textarea"
                    rows={4}
                    value={notesValue}
                    onChange={(e) => {
                      setNotesValue(e.target.value);
                      setMetaSavedMessage(null);
                    }}
                    placeholder="Anotações internas da equipe sobre conferência, contato ou encaminhamento..."
                    className="w-full p-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={savingMeta}
                      onClick={() => void handleSaveNotes()}
                      className="ameta-btn-interactive inline-flex h-10 items-center gap-2 px-4 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Salvar observações</span>
                    </button>
                  </div>
                </section>

                {/* Histórico de termos gerados */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
                  <div className="px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <ScrollText className="h-4 w-4 text-[#229A9A] shrink-0" aria-hidden="true" />
                      <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        Histórico de termos
                      </h2>
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">
                        ({terms.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTermModalOpen(true)}
                      className="ameta-btn-interactive inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] whitespace-nowrap"
                    >
                      <ScrollText className="h-3.5 w-3.5 text-[#229A9A]" aria-hidden="true" />
                      <span>Novo termo</span>
                    </button>
                  </div>

                  {loadingTerms ? (
                    <div className="p-5 text-xs text-[var(--text-muted)] flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Carregando histórico...</span>
                    </div>
                  ) : terms.length === 0 ? (
                    <div className="p-5 text-xs text-[var(--text-muted)]">
                      Nenhum termo gerado para este prestador até o momento.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border-default)]">
                      {terms.map((term) => {
                        const paymentSummary =
                          term.paymentMode === 'integral'
                            ? 'Integral em nota única'
                            : term.paymentMode === 'parcelado'
                              ? `Parcelado (${term.installmentsCount || '—'}x${
                                  term.installmentValueDisplay
                                    ? ` de R$ ${term.installmentValueDisplay}`
                                    : ''
                                })`
                              : 'Em branco (manual)';

                        const isDocxLoading = redownloadingKey === `${term.id}:docx`;
                        const isPdfLoading = redownloadingKey === `${term.id}:pdf`;
                        const docsList = term.selectedDocuments ?? [];
                        const isDocsExpanded = Boolean(expandedTermIds[term.id]);

                        return (
                          <li key={term.id} className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                                  {term.totalValueDisplay
                                    ? `R$ ${term.totalValueDisplay}`
                                    : 'Valor em branco'}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {paymentSummary}
                                  {term.startMonthYear ? ` · Início ${term.startMonthYear}` : ''}
                                </p>
                              </div>
                              <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                                {formatDateTimeBR(term.createdAt)}
                              </span>
                            </div>

                            <p className="text-[11.5px] text-[var(--text-muted)] truncate">
                              Por <strong className="text-[var(--text-secondary)]">{term.generatedByName}</strong>
                              {term.contractorCompanyName ? ` · ${term.contractorCompanyName}` : ''}
                            </p>

                            {docsList.length > 0 && (
                              <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                                <button
                                  type="button"
                                  aria-expanded={isDocsExpanded}
                                  onClick={() =>
                                    setExpandedTermIds((prev) => ({
                                      ...prev,
                                      [term.id]: !prev[term.id],
                                    }))
                                  }
                                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[11.5px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[8px] transition-colors"
                                >
                                  <span className="tabular-nums">
                                    Documentos incluídos ({docsList.length})
                                  </span>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
                                      isDocsExpanded ? 'rotate-180' : ''
                                    }`}
                                    aria-hidden="true"
                                  />
                                </button>
                                {isDocsExpanded && (
                                  <ul className="px-3 pb-2.5 pt-1 border-t border-[var(--border-default)] list-disc pl-6 space-y-1 text-[11.5px] text-[var(--text-secondary)]">
                                    {docsList.map((docLabel, idx) => (
                                      <li key={`${term.id}-doc-${idx}`}>{docLabel}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                disabled={redownloadingKey !== null}
                                onClick={() => void handleRedownloadDocx(term)}
                                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isDocxLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                <span>Word (.docx)</span>
                              </button>

                              <button
                                type="button"
                                disabled={redownloadingKey !== null}
                                onClick={() => void handleRedownloadPdf(term)}
                                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {isPdfLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                <span>PDF</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* Linha do tempo / Auditoria (somente admin) */}
                {isAdmin && (
                  <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
                    <div className="px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center gap-2">
                      <History className="h-4 w-4 text-[var(--brand-royal)] dark:text-[#8fa2ff]" aria-hidden="true" />
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        Linha do tempo (Auditoria)
                      </h2>
                    </div>

                    {auditLogs.length === 0 ? (
                      <div className="p-5 text-xs text-[var(--text-muted)]">
                        Nenhum evento registrado ainda.
                      </div>
                    ) : (
                      <ul className="p-4 space-y-3 max-h-80 overflow-y-auto">
                        {auditLogs.map((log) => {
                          const actionLabel =
                            log.acao === 'ABRIU_CADASTRO'
                              ? 'Abriu o cadastro'
                              : log.acao === 'EDITOU_CADASTRO'
                                ? 'Editou o cadastro'
                                : log.acao === 'ALTEROU_STATUS'
                                  ? `Alterou status (${log.detalhes?.statusAnterior || ''} → ${log.detalhes?.statusNovo || ''})`
                                  : log.acao === 'SALVOU_OBSERVACOES'
                                    ? 'Atualizou observações internas'
                                    : log.acao === 'GEROU_TERMO_DOCX'
                                      ? 'Gerou Termo (Word .docx)'
                                      : log.acao === 'GEROU_TERMO_PDF'
                                        ? 'Gerou Termo (PDF)'
                                        : log.acao === 'REBAIXOU_TERMO_DOCX'
                                          ? 'Baixou novamente (Word .docx)'
                                          : log.acao === 'REBAIXOU_TERMO_PDF'
                                            ? 'Baixou novamente (PDF)'
                                            : log.acao;
                          return (
                            <li key={log.id} className="relative pl-5 text-xs">
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#229A9A]"
                              />
                              <p className="text-[var(--text-primary)]">
                                <strong className="font-semibold">{log.nome}</strong>{' '}
                                <span className="text-[var(--text-secondary)]">— {actionLabel}</span>
                                {log.detalhes?.valorTotal ? ` · R$ ${log.detalhes.valorTotal}` : ''}
                              </p>
                              {log.detalhes?.resumo && (
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 break-words">
                                  {log.detalhes.resumo}
                                </p>
                              )}
                              <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">
                                {formatDateTimeBR(log.criadoEm)}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {termModalOpen && record && (
        <DiscountTermModal
          registration={record}
          currentUser={currentUser}
          lastTermDocuments={loadingTerms ? undefined : (terms[0]?.selectedDocuments ?? [])}
          onClose={() => setTermModalOpen(false)}
          onTermCreated={() => {}}
        />
      )}

      {confirmDeleteOpen && record && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-delete-title"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[1px]"
        >
          <div className="animate-modal-expand w-full max-w-md bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-6 shadow-[var(--shadow-elevated)]">
            <h2
              id="fullscreen-delete-title"
              className="font-display text-lg font-bold text-[var(--text-primary)]"
            >
              Excluir cadastro
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              Tem certeza que deseja excluir permanentemente a ficha de{' '}
              <strong className="font-semibold text-[var(--text-primary)]">
                {record.fullName}
              </strong>
              ? Esta ação também removerá o histórico de termos vinculado e não pode ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="inline-flex h-10 items-center px-4 rounded-[10px] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
                className="inline-flex h-10 items-center gap-2 px-4 rounded-[10px] bg-[var(--status-error)] hover:opacity-90 text-xs font-semibold text-white disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Confirmar exclusão</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
