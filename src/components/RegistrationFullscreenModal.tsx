import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
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
  {
    title: 'Empresa',
    fields: [
      { key: 'cnpj', label: 'Informe o CNPJ de sua empresa', mono: true },
      { key: 'companyAddress', label: 'Informe endereço da sua empresa' },
      { key: 'companyCep', label: 'Informe o CEP da sua empresa', mono: true },
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

export function RegistrationFullscreenModal({
  registrationId,
  orderedIds,
  currentUser,
  onClose,
  onSelectId,
}: RegistrationFullscreenModalProps) {
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
    if (currentUser.perfil === 'administrador') {
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
  }, [registrationId, currentUser.perfil]);

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
    window.setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopyField = async (key: string, value: string) => {
    await copyText(value);
    setCopiedFieldKey(key);
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
    } catch {
      setStatusValue(prev);
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
    } finally {
      setSavingMeta(false);
    }
  };

  const handleMarkUnseen = async () => {
    if (!record) return;
    setSavingMeta(true);
    try {
      await markCadastroUnseen(record.id, currentUser);
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
    } catch (err) {
      setSaveEditError(extractFriendlyFirestoreMessage(err, 'Erro ao salvar alterações.'));
    }
  };

  const handleRedownloadDocx = async (term: DiscountTermHistoryItem) => {
    setRedownloadingKey(`${term.id}:docx`);
    try {
      await exportDiscountTermToDocx(
        term.templateFields,
        term.contractorCompanyName || record?.fullName
      );
      await recordTermRedownloadAudit({
        cadastroId: registrationId,
        termoId: term.id,
        format: 'docx',
        actor: currentUser,
      });
    } finally {
      setRedownloadingKey(null);
    }
  };

  const handleRedownloadPdf = async (term: DiscountTermHistoryItem) => {
    setRedownloadingKey(`${term.id}:pdf`);
    try {
      exportDiscountTermToPdf(
        term.templateFields,
        term.contractorCompanyName || record?.fullName
      );
      await recordTermRedownloadAudit({
        cadastroId: registrationId,
        termoId: term.id,
        format: 'pdf',
        actor: currentUser,
      });
    } finally {
      setRedownloadingKey(null);
    }
  };

  const handleDelete = async () => {
    if (!record || currentUser.perfil !== 'administrador') return;
    setIsDeleting(true);
    try {
      await deleteCadastroWithCascade(record.id, record.fullName, currentUser);
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
    'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20';

  const isAdmin = currentUser.perfil === 'administrador';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização completa do cadastro"
      className="fixed inset-0 z-50 bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto flex flex-col"
    >
      <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3">
        <div className="max-w-[1120px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar visualização (Esc)"
              title="Fechar (Esc)"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!prevId}
                onClick={() => prevId && onSelectId(prevId)}
                title="Cadastro anterior (Seta esquerda)"
                className="inline-flex h-10 items-center gap-1 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              {currentIndex >= 0 && (
                <span className="px-2 text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {currentIndex + 1} de {orderedIds.length}
                </span>
              )}

              <button
                type="button"
                disabled={!nextId}
                onClick={() => nextId && onSelectId(nextId)}
                title="Próximo cadastro (Seta direita)"
                className="inline-flex h-10 items-center gap-1 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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
                className="inline-flex h-10 items-center gap-1.5 px-3.5 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] transition-colors whitespace-nowrap"
              >
                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Gerar Termo de Autorização de Desconto</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                {copiedAll ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Dados copiados</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar dados</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => exportRegistrationToPdf(record)}
                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Editar</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-800 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">Excluir</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 animate-pulse space-y-4">
            <div className="h-7 w-72 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-4 w-52 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-14 bg-slate-100 dark:bg-slate-800/70 rounded" />
              ))}
            </div>
          </div>
        ) : error || !record ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error || 'Cadastro não encontrado.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex h-10 items-center px-4 rounded-lg bg-[#0F2942] text-white text-xs font-semibold"
            >
              Voltar à lista
            </button>
          </div>
        ) : isEditing ? (
          <form
            onSubmit={handleSubmit(handleSaveEdit)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Editar Ficha Cadastral
              </h2>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSaveEditError(null);
                  setIsEditing(false);
                }}
                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancelar</span>
              </button>
            </div>

            {saveEditError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {saveEditError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Data da Cadastro
                </label>
                <input type="date" className={`${editInputClass} tabular-nums`} {...register('registrationDate')} />
                {errors.registrationDate && <p className="mt-1 text-xs text-red-600">{errors.registrationDate.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Qual será a sua função na empresa
                </label>
                <select className={editInputClass} {...register('role')}>
                  <option value="">Selecionar sua resposta</option>
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Nome Completo
                </label>
                <input type="text" className={editInputClass} {...register('fullName')} />
                {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
                {errors.cpf && <p className="mt-1 text-xs text-red-600">{errors.cpf.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Informe seu RG
                </label>
                <input type="text" className={`${editInputClass} tabular-nums`} {...register('rg')} />
                {errors.rg && <p className="mt-1 text-xs text-red-600">{errors.rg.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Informe sua Naturalidade
                </label>
                <input type="text" className={editInputClass} {...register('birthPlace')} />
                {errors.birthPlace && <p className="mt-1 text-xs text-red-600">{errors.birthPlace.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Informe sua Nacionalidade
                </label>
                <input type="text" className={editInputClass} {...register('nationality')} />
                {errors.nationality && <p className="mt-1 text-xs text-red-600">{errors.nationality.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Estado Civil
                </label>
                <select className={editInputClass} {...register('maritalStatus')}>
                  <option value="">Selecionar sua resposta</option>
                  {MARITAL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {errors.maritalStatus && <p className="mt-1 text-xs text-red-600">{errors.maritalStatus.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  DATA DE NASCIMENTO
                </label>
                <input type="date" className={`${editInputClass} tabular-nums`} {...register('birthDate')} />
                {errors.birthDate && <p className="mt-1 text-xs text-red-600">{errors.birthDate.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
                {errors.cnpj && <p className="mt-1 text-xs text-red-600">{errors.cnpj.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
                {errors.companyCep && <p className="mt-1 text-xs text-red-600">{errors.companyCep.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Informe endereço da sua empresa
                </label>
                <input type="text" className={editInputClass} {...register('companyAddress')} />
                {errors.companyAddress && <p className="mt-1 text-xs text-red-600">{errors.companyAddress.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Nome completo do Pai
                </label>
                <input type="text" className={editInputClass} {...register('fatherName')} />
                {errors.fatherName && <p className="mt-1 text-xs text-red-600">{errors.fatherName.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Nome completo da Mãe
                </label>
                <input type="text" className={editInputClass} {...register('motherName')} />
                {errors.motherName && <p className="mt-1 text-xs text-red-600">{errors.motherName.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Informe seu Email
                </label>
                <input type="email" className={editInputClass} {...register('email')} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSaveEditError(null);
                  setIsEditing(false);
                }}
                className="inline-flex h-10 items-center px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-10 items-center gap-2 px-5 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] disabled:opacity-60"
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {record.fullName}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {record.role}
                  </span>
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

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="fullscreen-status-select"
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    Status
                  </label>
                  <select
                    id="fullscreen-status-select"
                    value={statusValue}
                    disabled={savingMeta}
                    onChange={(e) => void handleStatusChange(e.target.value as RegistrationStatus)}
                    className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
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
                  className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Marcar não visto</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {FIELD_BLOCKS.map((block) => (
                <section
                  key={block.title}
                  className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden ${
                    block.title === 'Dados pessoais' ? 'lg:col-span-2' : ''
                  }`}
                >
                  <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {block.title}
                    </h2>
                  </div>

                  <dl
                    className={
                      block.title === 'Dados pessoais'
                        ? 'grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-slate-100 dark:bg-slate-800'
                        : 'divide-y divide-slate-100 dark:divide-slate-800'
                    }
                  >
                    {block.fields.map((field) => {
                      const rawValue = record[field.key];
                      const displayValue = field.isDate ? formatDateBR(rawValue) : rawValue;
                      const isFieldCopied = copiedFieldKey === field.key;

                      return (
                        <div
                          key={field.key}
                          className="bg-white dark:bg-slate-900 px-6 py-4 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {field.label}
                            </dt>
                            <dd
                              className={`mt-1 text-sm text-slate-900 dark:text-slate-100 break-words ${
                                field.mono ? 'font-mono tabular-nums' : 'font-medium'
                              }`}
                            >
                              {displayValue}
                            </dd>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleCopyField(field.key, displayValue)}
                            aria-label={`Copiar ${field.label}`}
                            title={`Copiar ${field.label}`}
                            className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                          >
                            {isFieldCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <label
                  htmlFor="internal-notes-textarea"
                  className="text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Observações internas
                </label>
                {metaSavedMessage && (
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {metaSavedMessage}
                  </span>
                )}
              </div>
              <textarea
                id="internal-notes-textarea"
                rows={3}
                value={notesValue}
                onChange={(e) => {
                  setNotesValue(e.target.value);
                  setMetaSavedMessage(null);
                }}
                placeholder="Anotações internas da equipe sobre conferência, contato ou encaminhamento..."
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={savingMeta}
                  onClick={() => void handleSaveNotes()}
                  className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] disabled:opacity-60 transition-colors"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Salvar observações</span>
                </button>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Termos de Autorização de Desconto Gerados
                  </h2>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    ({terms.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTermModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Novo termo</span>
                </button>
              </div>

              {loadingTerms ? (
                <div className="p-6 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Carregando histórico de termos...</span>
                </div>
              ) : terms.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
                  Nenhum termo gerado para este prestador até o momento.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {terms.map((term) => {
                    const paymentSummary =
                      term.paymentMode === 'integral'
                        ? 'Integralmente em uma única nota'
                        : term.paymentMode === 'parcelado'
                          ? `Parcelado em ${term.installmentsCount || '—'}x${
                              term.installmentValueDisplay
                                ? ` de R$ ${term.installmentValueDisplay}`
                                : ''
                            }`
                          : 'Em branco (manual)';

                    const isDocxLoading = redownloadingKey === `${term.id}:docx`;
                    const isPdfLoading = redownloadingKey === `${term.id}:pdf`;

                    return (
                      <li
                        key={term.id}
                        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                              {term.totalValueDisplay ? `R$ ${term.totalValueDisplay}` : 'Valor em branco'}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {paymentSummary}
                            </span>
                            {term.startMonthYear && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                · Início: {term.startMonthYear}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>
                              Contratada:{' '}
                              <strong className="font-medium text-slate-700 dark:text-slate-300">
                                {term.contractorCompanyName || 'Em branco'}
                              </strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Gerado por{' '}
                              <strong className="font-medium text-slate-700 dark:text-slate-300">
                                {term.generatedByName}
                              </strong>{' '}
                              ({term.generatedByEmail})
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatDateTimeBR(term.createdAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={redownloadingKey !== null}
                            onClick={() => void handleRedownloadDocx(term)}
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {isDocxLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>Baixar Word (.docx)</span>
                          </button>

                          <button
                            type="button"
                            disabled={redownloadingKey !== null}
                            onClick={() => void handleRedownloadPdf(term)}
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {isPdfLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>Baixar PDF</span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isAdmin && auditLogs.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/40 dark:bg-slate-950/30">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2.5">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Auditoria (visível apenas para administradores)</span>
                  </div>
                  <ul className="space-y-1.5">
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
                        <li
                          key={log.id}
                          className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            <strong className="font-medium text-slate-700 dark:text-slate-300">
                              {log.atorNome}
                            </strong>{' '}
                            ({log.atorEmail}) — {actionLabel}
                            {log.detalhes?.valorTotal ? ` · R$ ${log.detalhes.valorTotal}` : ''}
                          </span>
                          <span className="tabular-nums">{formatDateTimeBR(log.criadoEm)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {termModalOpen && record && (
        <DiscountTermModal
          registration={record}
          currentUser={currentUser}
          onClose={() => setTermModalOpen(false)}
          onTermCreated={() => {}}
        />
      )}

      {confirmDeleteOpen && record && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-delete-title"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xl">
            <h2
              id="fullscreen-delete-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Excluir cadastro
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Tem certeza que deseja excluir permanentemente a ficha de{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">
                {record.fullName}
              </strong>
              ? Esta ação também removerá o histórico de termos vinculado e não pode ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="inline-flex h-10 items-center px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
                className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white disabled:opacity-60"
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
