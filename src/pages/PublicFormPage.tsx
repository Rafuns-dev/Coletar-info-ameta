import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Paperclip,
  Phone,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import { firebaseRuntimeConfig } from '../firebase.ts';
import {
  extractFirebaseErrorDetails,
  extractFriendlyFirestoreMessage,
  submitPublicRegistration,
} from '../services/firestoreService.ts';
import { MARITAL_STATUS_OPTIONS, ROLE_OPTIONS } from '../shared/formConfig.ts';
import {
  contractorRegistrationSchema,
  type ContractorRegistrationInput,
  type RegistrationDocumentAttachmentInput,
  type RegistrationDocumentType,
} from '../shared/schema.ts';
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  getTodayISODate,
} from '../shared/validators.ts';
import {
  buildAttachmentDataUrl,
  formatBytesLabel,
  prepareAttachmentFile,
  REGISTRATION_DOCUMENT_SLOTS,
} from '../utils/documentUpload.ts';

interface PublicFormPageProps {
  onNavigate: (path: string) => void;
}

const RATE_LIMIT_STORAGE_KEY = 'ameta_public_submit_timestamps_v1';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 3;

function isClientRateLimited(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const now = Date.now();
    const prev: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const recent = prev.filter((ts) => typeof ts === 'number' && now - ts < RATE_LIMIT_WINDOW_MS);
    return recent.length >= RATE_LIMIT_MAX_ATTEMPTS;
  } catch {
    return false;
  }
}

function recordClientRateLimitAttempt(): void {
  try {
    const raw = window.sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const now = Date.now();
    const prev: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const recent = prev.filter((ts) => typeof ts === 'number' && now - ts < RATE_LIMIT_WINDOW_MS);
    recent.push(now);
    window.sessionStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // ignora caso sessionStorage esteja indisponível
  }
}

const labelBaseClass =
  'block text-[13px] font-semibold text-[#1B2340] mb-1.5 transition-colors group-focus-within:text-[#2536A8]';

function getFieldClass(hasError: boolean, isValid: boolean, extra = ''): string {
  const base =
    'w-full min-h-[46px] px-3.5 pr-10 rounded-[10px] border bg-white text-[15px] text-[#1B2340] placeholder:text-[#7F7F7F]/70 transition-all duration-150 focus:outline-none focus:ring-3';
  if (hasError) {
    return `${base} border-[#D64545] focus:border-[#D64545] focus:ring-[#D64545]/15 ${extra}`;
  }
  if (isValid) {
    return `${base} border-[#1E9E6A]/65 focus:border-[#2536A8] focus:ring-[#2536A8]/15 ${extra}`;
  }
  return `${base} border-[#E3E7EF] hover:border-[#CDD4E3] focus:border-[#2536A8] focus:ring-[#2536A8]/15 ${extra}`;
}

export function PublicFormPage({ onNavigate }: PublicFormPageProps) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [attachments, setAttachments] = useState<
    Partial<Record<RegistrationDocumentType, RegistrationDocumentAttachmentInput>>
  >({});
  const [attachmentErrors, setAttachmentErrors] = useState<
    Partial<Record<RegistrationDocumentType, string>>
  >({});
  const [processingDocType, setProcessingDocType] = useState<RegistrationDocumentType | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, touchedFields, isSubmitting },
  } = useForm<ContractorRegistrationInput>({
    resolver: zodResolver(contractorRegistrationSchema),
    mode: 'onBlur',
    defaultValues: {
      registrationDate: getTodayISODate(),
      role: '',
      fullName: '',
      cpf: '',
      rg: '',
      birthPlace: '',
      nationality: '',
      maritalStatus: '',
      birthDate: '',
      cnpj: '',
      companyAddress: '',
      companyCep: '',
      fatherName: '',
      motherName: '',
      email: '',
      phone: '',
    },
  });

  const watchedValues = watch();

  const isFieldValid = (name: keyof ContractorRegistrationInput): boolean => {
    if (errors[name]) return false;
    const val = String(watchedValues[name] ?? '').trim();
    return Boolean(touchedFields[name] && val.length > 0);
  };

  const renderStatusAdornment = (name: keyof ContractorRegistrationInput, isSelectOrDate = false) => {
    const rightOffset = isSelectOrDate ? 'right-9' : 'right-3';
    if (errors[name]) {
      return (
        <AlertCircle
          className={`h-4 w-4 text-[#D64545] absolute ${rightOffset} top-1/2 -translate-y-1/2 pointer-events-none animate-page-enter`}
          aria-hidden="true"
        />
      );
    }
    if (isFieldValid(name)) {
      return (
        <CheckCircle2
          className={`h-4 w-4 text-[#1E9E6A] absolute ${rightOffset} top-1/2 -translate-y-1/2 pointer-events-none animate-page-enter`}
          aria-hidden="true"
        />
      );
    }
    return null;
  };

  const handleAttachmentChange = async (
    tipo: RegistrationDocumentType,
    file: File | null
  ) => {
    if (!file) return;
    setAttachmentErrors((prev) => ({ ...prev, [tipo]: undefined }));
    setProcessingDocType(tipo);
    try {
      const prepared = await prepareAttachmentFile(file, tipo);
      setAttachments((prev) => ({ ...prev, [tipo]: prepared }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar este arquivo. Tente outro formato.';
      setAttachmentErrors((prev) => ({ ...prev, [tipo]: message }));
    } finally {
      setProcessingDocType((curr) => (curr === tipo ? null : curr));
    }
  };

  const handleRemoveAttachment = (tipo: RegistrationDocumentType) => {
    setAttachments((prev) => {
      const next = { ...prev };
      delete next[tipo];
      return next;
    });
    setAttachmentErrors((prev) => ({ ...prev, [tipo]: undefined }));
  };

  const onSubmit = async (data: ContractorRegistrationInput) => {
    setServerError(null);

    if (honeypot.trim().length > 0) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (isClientRateLimited()) {
      setServerError(
        'Muitos envios seguidos detectados neste navegador. Aguarde alguns minutos e tente novamente.'
      );
      return;
    }

    try {
      const attachmentList = Object.values(attachments).filter(
        (item): item is RegistrationDocumentAttachmentInput => Boolean(item)
      );
      await submitPublicRegistration(data, attachmentList);
      recordClientRateLimitAttempt();
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const details = extractFirebaseErrorDetails(error);
      console.error('[Ameta Formulário Público - Erro Firebase]', {
        code: details.code || null,
        message: details.message,
        path: details.path || 'cadastros',
        projectId: firebaseRuntimeConfig.projectId,
        databaseId: firebaseRuntimeConfig.databaseId,
        error,
      });
      setServerError(
        extractFriendlyFirestoreMessage(
          error,
          'Não foi possível enviar o cadastro. Verifique os dados informados e tente novamente.',
          true
        )
      );
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F5F7FB] text-[#1B2340] flex flex-col overflow-x-hidden">
      {/* Fundo geométrico sutil inspirado nos losangos do logo */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div
          className="absolute -top-28 -right-24 h-80 w-80 rotate-45 rounded-[28px] border-[18px] border-[#1F2E85]/[0.045]"
        />
        <div
          className="absolute -top-10 right-16 h-64 w-64 rotate-45 rounded-[24px] border-[16px] border-[#229A9A]/[0.05]"
        />
        <div
          className="absolute -bottom-32 -left-24 h-88 w-88 rotate-45 rounded-[30px] border-[18px] border-[#229A9A]/[0.045]"
        />
        <div
          className="absolute bottom-10 -left-4 h-60 w-60 rotate-45 rounded-[24px] border-[14px] border-[#1F2E85]/[0.04]"
        />
      </div>

      <main className="relative z-10 flex-1 w-full max-w-[820px] mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-page-enter">
        <header className="mb-8 text-center">
          <div className="inline-flex justify-center mb-4">
            <AmetaLogo size="lg" />
          </div>
          <h1 className="font-display text-2xl sm:text-[30px] font-bold tracking-tight text-[#1F2E85] text-balance">
            Cadastro de Prestador
          </h1>
          <p className="mt-2 text-sm sm:text-[15px] text-[#7F7F7F] max-w-lg mx-auto leading-relaxed">
            Preencha seus dados abaixo para iniciar seu cadastro de primeiro contato com a Ameta Serviços.
          </p>
        </header>

        {submitted ? (
          <section
            aria-live="polite"
            className="animate-page-enter bg-white border border-[#E3E7EF] rounded-[12px] shadow-[var(--shadow-card)] p-8 sm:p-12 text-center"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#EBF9F3] border border-[#BCE8D4] animate-check-circle">
              <svg
                viewBox="0 0 32 32"
                className="h-8 w-8 text-[#1E9E6A]"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M7 16.5L13.2 22.5L25 10.5"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-check-path"
                />
              </svg>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1B2340]">
              Cadastro enviado com sucesso
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#5E667D] max-w-md mx-auto">
              Recebemos suas informações com segurança. Nossa equipe analisará os dados enviados e
              entrará em contato para dar sequência às próximas etapas.
            </p>
          </section>
        ) : (
          <section className="bg-white border border-[#E3E7EF] rounded-[12px] shadow-[var(--shadow-card)] overflow-hidden">
            <div
              className="h-1.5 w-full"
              style={{ background: 'var(--brand-gradient)' }}
              aria-hidden="true"
            />
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-5 sm:p-8 lg:p-10 space-y-8">
              {/* Campo anti-spam invisível (honeypot) */}
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden opacity-0 pointer-events-none"
              >
                <label htmlFor="_companyWebsite">Website</label>
                <input
                  id="_companyWebsite"
                  name="_companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {serverError && (
                <div
                  role="alert"
                  className="rounded-[10px] border border-[#F5C6C6] bg-[#FDF1F1] px-4 py-3 text-sm text-[#D64545] flex items-start gap-2.5"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Grupo decorativo 1: Dados pessoais (campos 1 a 9 na ordem exata) */}
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#E3E7EF]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF1FC] text-[#1F2E85]">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="font-display text-sm font-bold tracking-tight text-[#1F2E85]">
                    Dados pessoais
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* 1. Data da Cadastro */}
                  <div className="group">
                    <label htmlFor="registrationDate" className={labelBaseClass}>
                      Data da Cadastro
                    </label>
                    <div className="relative">
                      <input
                        id="registrationDate"
                        type="date"
                        required
                        aria-invalid={Boolean(errors.registrationDate)}
                        className={getFieldClass(
                          Boolean(errors.registrationDate),
                          isFieldValid('registrationDate'),
                          'tabular-nums pr-3.5'
                        )}
                        {...register('registrationDate')}
                      />
                    </div>
                    {errors.registrationDate && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.registrationDate.message}
                      </p>
                    )}
                  </div>

                  {/* 2. Qual será a sua função na empresa */}
                  <div className="group">
                    <label htmlFor="role" className={labelBaseClass}>
                      Qual será a sua função na empresa
                    </label>
                    <div className="relative">
                      <Briefcase
                        className="h-4 w-4 text-[#7F7F7F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <select
                        id="role"
                        required
                        aria-invalid={Boolean(errors.role)}
                        className={getFieldClass(
                          Boolean(errors.role),
                          isFieldValid('role'),
                          'pl-10 pr-9 cursor-pointer'
                        )}
                        {...register('role')}
                      >
                        <option value="">Selecionar sua resposta</option>
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {renderStatusAdornment('role', true)}
                    </div>
                    {errors.role && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.role.message}
                      </p>
                    )}
                  </div>

                  {/* 3. Nome Completo */}
                  <div className="group md:col-span-2">
                    <label htmlFor="fullName" className={labelBaseClass}>
                      Nome Completo
                    </label>
                    <div className="relative">
                      <input
                        id="fullName"
                        type="text"
                        required
                        autoComplete="name"
                        aria-invalid={Boolean(errors.fullName)}
                        className={getFieldClass(
                          Boolean(errors.fullName),
                          isFieldValid('fullName')
                        )}
                        {...register('fullName')}
                      />
                      {renderStatusAdornment('fullName')}
                    </div>
                    {errors.fullName && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.fullName.message}
                      </p>
                    )}
                  </div>

                  {/* 4. Informe seu CPF */}
                  <div className="group">
                    <label htmlFor="cpf" className={labelBaseClass}>
                      Informe seu CPF
                    </label>
                    <div className="relative">
                      <Controller
                        name="cpf"
                        control={control}
                        render={({ field }) => (
                          <input
                            id="cpf"
                            type="text"
                            inputMode="numeric"
                            maxLength={14}
                            required
                            placeholder="000.000.000-00"
                            aria-invalid={Boolean(errors.cpf)}
                            className={getFieldClass(
                              Boolean(errors.cpf),
                              isFieldValid('cpf'),
                              'tabular-nums'
                            )}
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(e) => field.onChange(formatCPF(e.target.value))}
                          />
                        )}
                      />
                      {renderStatusAdornment('cpf')}
                    </div>
                    {errors.cpf && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.cpf.message}
                      </p>
                    )}
                  </div>

                  {/* 5. Informe seu RG */}
                  <div className="group">
                    <label htmlFor="rg" className={labelBaseClass}>
                      Informe seu RG
                    </label>
                    <div className="relative">
                      <input
                        id="rg"
                        type="text"
                        required
                        aria-invalid={Boolean(errors.rg)}
                        className={getFieldClass(
                          Boolean(errors.rg),
                          isFieldValid('rg'),
                          'tabular-nums'
                        )}
                        {...register('rg')}
                      />
                      {renderStatusAdornment('rg')}
                    </div>
                    {errors.rg && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.rg.message}
                      </p>
                    )}
                  </div>

                  {/* 6. Informe sua Naturalidade */}
                  <div className="group">
                    <label htmlFor="birthPlace" className={labelBaseClass}>
                      Informe sua Naturalidade
                    </label>
                    <div className="relative">
                      <input
                        id="birthPlace"
                        type="text"
                        required
                        placeholder="Ex: São Paulo, Resende, Rio de Janeiro ...."
                        aria-invalid={Boolean(errors.birthPlace)}
                        className={getFieldClass(
                          Boolean(errors.birthPlace),
                          isFieldValid('birthPlace')
                        )}
                        {...register('birthPlace')}
                      />
                      {renderStatusAdornment('birthPlace')}
                    </div>
                    {errors.birthPlace && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.birthPlace.message}
                      </p>
                    )}
                  </div>

                  {/* 7. Informe sua Nacionalidade */}
                  <div className="group">
                    <label htmlFor="nationality" className={labelBaseClass}>
                      Informe sua Nacionalidade
                    </label>
                    <div className="relative">
                      <input
                        id="nationality"
                        type="text"
                        required
                        placeholder="Ex: Brasileira, Argentina, Chilena ....."
                        aria-invalid={Boolean(errors.nationality)}
                        className={getFieldClass(
                          Boolean(errors.nationality),
                          isFieldValid('nationality')
                        )}
                        {...register('nationality')}
                      />
                      {renderStatusAdornment('nationality')}
                    </div>
                    {errors.nationality && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.nationality.message}
                      </p>
                    )}
                  </div>

                  {/* 8. Estado Civil */}
                  <div className="group">
                    <label htmlFor="maritalStatus" className={labelBaseClass}>
                      Estado Civil
                    </label>
                    <div className="relative">
                      <select
                        id="maritalStatus"
                        required
                        aria-invalid={Boolean(errors.maritalStatus)}
                        className={getFieldClass(
                          Boolean(errors.maritalStatus),
                          isFieldValid('maritalStatus'),
                          'pr-9 cursor-pointer'
                        )}
                        {...register('maritalStatus')}
                      >
                        <option value="">Selecionar sua resposta</option>
                        {MARITAL_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {renderStatusAdornment('maritalStatus', true)}
                    </div>
                    {errors.maritalStatus && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.maritalStatus.message}
                      </p>
                    )}
                  </div>

                  {/* 9. DATA DE NASCIMENTO */}
                  <div className="group">
                    <label htmlFor="birthDate" className={labelBaseClass}>
                      DATA DE NASCIMENTO
                    </label>
                    <div className="relative">
                      <input
                        id="birthDate"
                        type="date"
                        required
                        aria-invalid={Boolean(errors.birthDate)}
                        className={getFieldClass(
                          Boolean(errors.birthDate),
                          isFieldValid('birthDate'),
                          'tabular-nums pr-3.5'
                        )}
                        {...register('birthDate')}
                      />
                    </div>
                    {errors.birthDate && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.birthDate.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grupo decorativo 2: Empresa (campos 10 a 12 na ordem exata) */}
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#E3E7EF]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#E6F6F6] text-[#229A9A]">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="font-display text-sm font-bold tracking-tight text-[#1F2E85]">
                    Empresa
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* 10. Informe o CNPJ de sua empresa */}
                  <div className="group">
                    <label htmlFor="cnpj" className={labelBaseClass}>
                      Informe o CNPJ de sua empresa
                    </label>
                    <div className="relative">
                      <Controller
                        name="cnpj"
                        control={control}
                        render={({ field }) => (
                          <input
                            id="cnpj"
                            type="text"
                            inputMode="numeric"
                            maxLength={18}
                            required
                            placeholder="00.000.000/0000-00"
                            aria-invalid={Boolean(errors.cnpj)}
                            className={getFieldClass(
                              Boolean(errors.cnpj),
                              isFieldValid('cnpj'),
                              'tabular-nums'
                            )}
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                          />
                        )}
                      />
                      {renderStatusAdornment('cnpj')}
                    </div>
                    {errors.cnpj && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.cnpj.message}
                      </p>
                    )}
                  </div>

                  {/* 12 é CEP; 11 é endereço — mantendo EXATAMENTE a ordem 10, 11, 12 */}
                  {/* 11. Informe endereço da sua empresa */}
                  <div className="group md:col-span-2">
                    <label htmlFor="companyAddress" className={labelBaseClass}>
                      Informe endereço da sua empresa
                    </label>
                    <div className="relative">
                      <input
                        id="companyAddress"
                        type="text"
                        required
                        autoComplete="street-address"
                        aria-invalid={Boolean(errors.companyAddress)}
                        className={getFieldClass(
                          Boolean(errors.companyAddress),
                          isFieldValid('companyAddress')
                        )}
                        {...register('companyAddress')}
                      />
                      {renderStatusAdornment('companyAddress')}
                    </div>
                    {errors.companyAddress && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.companyAddress.message}
                      </p>
                    )}
                  </div>

                  {/* 12. Informe o CEP da sua empresa */}
                  <div className="group">
                    <label htmlFor="companyCep" className={labelBaseClass}>
                      Informe o CEP da sua empresa
                    </label>
                    <div className="relative">
                      <Controller
                        name="companyCep"
                        control={control}
                        render={({ field }) => (
                          <input
                            id="companyCep"
                            type="text"
                            inputMode="numeric"
                            maxLength={9}
                            required
                            placeholder="00000-000"
                            autoComplete="postal-code"
                            aria-invalid={Boolean(errors.companyCep)}
                            className={getFieldClass(
                              Boolean(errors.companyCep),
                              isFieldValid('companyCep'),
                              'tabular-nums'
                            )}
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(e) => field.onChange(formatCEP(e.target.value))}
                          />
                        )}
                      />
                      {renderStatusAdornment('companyCep')}
                    </div>
                    {errors.companyCep && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.companyCep.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grupo decorativo 3: Filiação (campos 13 e 14 na ordem exata) */}
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#E3E7EF]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF1FC] text-[#1F2E85]">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="font-display text-sm font-bold tracking-tight text-[#1F2E85]">
                    Filiação
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* 13. Nome completo do Pai */}
                  <div className="group">
                    <label htmlFor="fatherName" className={labelBaseClass}>
                      Nome completo do Pai
                    </label>
                    <div className="relative">
                      <input
                        id="fatherName"
                        type="text"
                        required
                        aria-invalid={Boolean(errors.fatherName)}
                        className={getFieldClass(
                          Boolean(errors.fatherName),
                          isFieldValid('fatherName')
                        )}
                        {...register('fatherName')}
                      />
                      {renderStatusAdornment('fatherName')}
                    </div>
                    {errors.fatherName && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.fatherName.message}
                      </p>
                    )}
                  </div>

                  {/* 14. Nome completo da Mãe */}
                  <div className="group">
                    <label htmlFor="motherName" className={labelBaseClass}>
                      Nome completo da Mãe
                    </label>
                    <div className="relative">
                      <input
                        id="motherName"
                        type="text"
                        required
                        aria-invalid={Boolean(errors.motherName)}
                        className={getFieldClass(
                          Boolean(errors.motherName),
                          isFieldValid('motherName')
                        )}
                        {...register('motherName')}
                      />
                      {renderStatusAdornment('motherName')}
                    </div>
                    {errors.motherName && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.motherName.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grupo decorativo 4: Contato (campos 15 e 16 na ordem exata) */}
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#E3E7EF]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#E6F6F6] text-[#229A9A]">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="font-display text-sm font-bold tracking-tight text-[#1F2E85]">
                    Contato
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* 15. Informe seu Email */}
                  <div className="group">
                    <label htmlFor="email" className={labelBaseClass}>
                      Informe seu Email
                    </label>
                    <div className="relative">
                      <input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="email@exemplo.com.br"
                        aria-invalid={Boolean(errors.email)}
                        className={getFieldClass(
                          Boolean(errors.email),
                          isFieldValid('email')
                        )}
                        {...register('email')}
                      />
                      {renderStatusAdornment('email')}
                    </div>
                    {errors.email && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* 16. Informe o seu Telefone com DDD */}
                  <div className="group">
                    <label htmlFor="phone" className={labelBaseClass}>
                      Informe o seu Telefone com DDD
                    </label>
                    <div className="relative">
                      <Controller
                        name="phone"
                        control={control}
                        render={({ field }) => (
                          <input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            maxLength={15}
                            required
                            placeholder="Ex: (11) 0000-0000"
                            autoComplete="tel"
                            aria-invalid={Boolean(errors.phone)}
                            className={getFieldClass(
                              Boolean(errors.phone),
                              isFieldValid('phone'),
                              'tabular-nums'
                            )}
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(e) => field.onChange(formatPhone(e.target.value))}
                          />
                        )}
                      />
                      {renderStatusAdornment('phone')}
                    </div>
                    {errors.phone && (
                      <p role="alert" className="mt-1.5 text-xs font-medium text-[#D64545]">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Anexos opcionais de documentos (RG, CNH, Certificado MEI) */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E3E7EF]">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF1FC] text-[#1F2E85]">
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="font-display text-sm font-bold tracking-tight text-[#1F2E85]">
                        Documentos (Opcional)
                      </h2>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#7F7F7F]">
                    Envio não obrigatório · PDF, JPG, PNG ou WEBP
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {REGISTRATION_DOCUMENT_SLOTS.map((slot) => {
                    const attached = attachments[slot.type];
                    const docError = attachmentErrors[slot.type];
                    const isProcessing = processingDocType === slot.type;
                    const inputId = `doc-upload-${slot.type}`;
                    const isImage = attached?.mimeType.startsWith('image/');

                    return (
                      <div
                        key={slot.type}
                        className={`rounded-[12px] border p-4 transition-colors flex flex-col justify-between gap-3 ${
                          docError
                            ? 'border-[#D64545] bg-[#FDF1F1]/40'
                            : attached
                              ? 'border-[#1E9E6A]/55 bg-[#EBF9F3]/40'
                              : 'border-[#E3E7EF] bg-[#F8FAFD] hover:border-[#CDD4E3]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[#1B2340]">
                              {slot.title}
                            </span>
                            <span className="text-[10.5px] font-medium text-[#7F7F7F]">
                              Opcional
                            </span>
                          </div>
                          <p className="mt-1 text-[11.5px] text-[#7F7F7F] leading-snug">
                            {slot.description}
                          </p>
                        </div>

                        {attached ? (
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-2.5 rounded-[10px] border border-[#E3E7EF] bg-white p-2.5">
                              {isImage ? (
                                <img
                                  src={buildAttachmentDataUrl(attached)}
                                  alt={slot.title}
                                  className="h-10 w-10 rounded-[6px] object-cover border border-[#E3E7EF] shrink-0"
                                />
                              ) : (
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] bg-[#EEF1FC] text-[#1F2E85] shrink-0">
                                  <FileText className="h-5 w-5" aria-hidden="true" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-xs font-semibold text-[#1B2340] truncate"
                                  title={attached.nomeArquivo}
                                >
                                  {attached.nomeArquivo}
                                </p>
                                <p className="text-[11px] text-[#1E9E6A] font-medium tabular-nums">
                                  Anexado · {formatBytesLabel(attached.tamanhoBytes)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={inputId}
                                className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 px-2.5 rounded-[8px] border border-[#E3E7EF] bg-white hover:bg-[#F5F7FB] text-[11.5px] font-semibold text-[#1F2E85] cursor-pointer transition-colors"
                              >
                                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Trocar</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(slot.type)}
                                aria-label={`Remover ${slot.title}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#F5C6C6] bg-white hover:bg-[#FDF1F1] text-[#D64545] transition-colors shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label
                            htmlFor={inputId}
                            className="group flex flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#CDD4E3] bg-white hover:border-[#2536A8] hover:bg-[#F5F7FB] px-3 py-4 text-center cursor-pointer transition-colors"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2
                                  className="h-5 w-5 animate-spin text-[#2536A8]"
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-medium text-[#2536A8]">
                                  Preparando arquivo...
                                </span>
                              </>
                            ) : (
                              <>
                                <FileUp
                                  className="h-5 w-5 text-[#229A9A] group-hover:text-[#2536A8] transition-colors"
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-semibold text-[#1F2E85]">
                                  Selecionar arquivo
                                </span>
                                <span className="text-[10.5px] text-[#7F7F7F]">
                                  PDF até 650 KB ou foto
                                </span>
                              </>
                            )}
                          </label>
                        )}

                        <input
                          id={inputId}
                          type="file"
                          accept={slot.accept}
                          disabled={isProcessing || isSubmitting}
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            e.target.value = '';
                            void handleAttachmentChange(slot.type, file);
                          }}
                        />

                        {docError && (
                          <p role="alert" className="text-[11.5px] font-medium text-[#D64545] leading-snug">
                            {docError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={isSubmitting || processingDocType !== null}
                  className="ameta-btn-interactive w-full min-h-[52px] rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] active:bg-[#172368] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[15px] shadow-[0_6px_18px_-6px_rgba(31,46,133,0.45)] inline-flex items-center justify-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2536A8]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      <span>Enviando cadastro...</span>
                    </>
                  ) : processingDocType !== null ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      <span>Processando documento...</span>
                    </>
                  ) : (
                    <span>Enviar</span>
                  )}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[#7F7F7F]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#229A9A] shrink-0" aria-hidden="true" />
                  <span>
                    Seus dados são utilizados pela Ameta Serviços exclusivamente para este cadastro inicial, em conformidade com a LGPD.
                  </span>
                </p>
              </div>
            </form>
          </section>
        )}
      </main>

      <footer className="relative z-10 py-6 px-4 text-center text-xs text-[#7F7F7F]">
        <span>© {new Date().getFullYear()} Ameta Serviços</span>
        <span aria-hidden="true" className="mx-2">
          ·
        </span>
        <a
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/admin');
          }}
          className="font-medium text-[#1F2E85] hover:text-[#2536A8] hover:underline transition-colors"
        >
          Área administrativa
        </a>
      </footer>
    </div>
  );
}
