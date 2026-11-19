import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import {
  extractFriendlyFirestoreMessage,
  submitPublicRegistration,
} from '../services/firestoreService.ts';
import { MARITAL_STATUS_OPTIONS, ROLE_OPTIONS } from '../shared/formConfig.ts';
import {
  contractorRegistrationSchema,
  type ContractorRegistrationInput,
} from '../shared/schema.ts';
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  getTodayISODate,
} from '../shared/validators.ts';

interface PublicFormPageProps {
  onNavigate: (path: string) => void;
}

const RATE_LIMIT_STORAGE_KEY = 'ameta_public_submit_timestamps_v1';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 3;

function checkAndRecordClientRateLimit(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const now = Date.now();
    const prev: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const recent = prev.filter((ts) => typeof ts === 'number' && now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      return false;
    }
    recent.push(now);
    window.sessionStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recent));
    return true;
  } catch {
    return true;
  }
}

const inputBaseClass =
  'w-full h-11 px-3.5 rounded-lg border bg-white text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F2942]/15 focus:border-[#0F2942]';

const labelBaseClass = 'block text-sm font-medium text-slate-800 mb-1.5';

export function PublicFormPage({ onNavigate }: PublicFormPageProps) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
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

  const onSubmit = async (data: ContractorRegistrationInput) => {
    setServerError(null);

    if (honeypot.trim().length > 0) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!checkAndRecordClientRateLimit()) {
      setServerError(
        'Muitos envios seguidos detectados neste navegador. Aguarde alguns minutos e tente novamente.'
      );
      return;
    }

    try {
      await submitPublicRegistration(data);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setServerError(
        extractFriendlyFirestoreMessage(
          error,
          'Não foi possível enviar o cadastro. Verifique os dados informados e tente novamente.'
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      <main className="flex-1 w-full max-w-[680px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-8 text-center">
          <div className="inline-flex justify-center mb-5">
            <AmetaLogo size="lg" />
          </div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#0F2942] text-balance">
            Cadastro de Prestadores
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Primeiro Contato — Ameta
          </p>
        </div>

        {submitted ? (
          <section
            aria-live="polite"
            className="bg-white border border-slate-200/90 rounded-xl shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] p-8 sm:p-12 text-center"
          >
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
              Cadastro enviado com sucesso
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 max-w-md mx-auto">
              Recebemos seus dados iniciais. Nossa equipe consultará estas informações para dar
              andamento às próximas etapas.
            </p>
          </section>
        ) : (
          <section className="bg-white border border-slate-200/90 rounded-xl shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] p-6 sm:p-10">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
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
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {serverError}
                </div>
              )}

              {/* 1. Data da Cadastro */}
              <div>
                <label htmlFor="registrationDate" className={labelBaseClass}>
                  Data da Cadastro
                </label>
                <input
                  id="registrationDate"
                  type="date"
                  required
                  aria-invalid={Boolean(errors.registrationDate)}
                  className={`${inputBaseClass} tabular-nums ${
                    errors.registrationDate ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('registrationDate')}
                />
                {errors.registrationDate && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.registrationDate.message}
                  </p>
                )}
              </div>

              {/* 2. Qual será a sua função na empresa */}
              <div>
                <label htmlFor="role" className={labelBaseClass}>
                  Qual será a sua função na empresa
                </label>
                <select
                  id="role"
                  required
                  aria-invalid={Boolean(errors.role)}
                  className={`${inputBaseClass} ${
                    errors.role ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('role')}
                >
                  <option value="">Selecionar sua resposta</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.role && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.role.message}
                  </p>
                )}
              </div>

              {/* 3. Nome Completo */}
              <div>
                <label htmlFor="fullName" className={labelBaseClass}>
                  Nome Completo
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  autoComplete="name"
                  aria-invalid={Boolean(errors.fullName)}
                  className={`${inputBaseClass} ${
                    errors.fullName ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('fullName')}
                />
                {errors.fullName && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.fullName.message}
                  </p>
                )}
              </div>

              {/* 4. Informe seu CPF */}
              <div>
                <label htmlFor="cpf" className={labelBaseClass}>
                  Informe seu CPF
                </label>
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
                      aria-invalid={Boolean(errors.cpf)}
                      className={`${inputBaseClass} tabular-nums ${
                        errors.cpf ? 'border-red-500' : 'border-slate-300'
                      }`}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(formatCPF(e.target.value))}
                    />
                  )}
                />
                {errors.cpf && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.cpf.message}
                  </p>
                )}
              </div>

              {/* 5. Informe seu RG */}
              <div>
                <label htmlFor="rg" className={labelBaseClass}>
                  Informe seu RG
                </label>
                <input
                  id="rg"
                  type="text"
                  required
                  aria-invalid={Boolean(errors.rg)}
                  className={`${inputBaseClass} tabular-nums ${
                    errors.rg ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('rg')}
                />
                {errors.rg && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.rg.message}
                  </p>
                )}
              </div>

              {/* 6. Informe sua Naturalidade */}
              <div>
                <label htmlFor="birthPlace" className={labelBaseClass}>
                  Informe sua Naturalidade
                </label>
                <input
                  id="birthPlace"
                  type="text"
                  required
                  placeholder="Ex: São Paulo, Resende, Rio de Janeiro ...."
                  aria-invalid={Boolean(errors.birthPlace)}
                  className={`${inputBaseClass} ${
                    errors.birthPlace ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('birthPlace')}
                />
                {errors.birthPlace && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.birthPlace.message}
                  </p>
                )}
              </div>

              {/* 7. Informe sua Nacionalidade */}
              <div>
                <label htmlFor="nationality" className={labelBaseClass}>
                  Informe sua Nacionalidade
                </label>
                <input
                  id="nationality"
                  type="text"
                  required
                  placeholder="Ex: Brasileira, Argentina, Chilena ....."
                  aria-invalid={Boolean(errors.nationality)}
                  className={`${inputBaseClass} ${
                    errors.nationality ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('nationality')}
                />
                {errors.nationality && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.nationality.message}
                  </p>
                )}
              </div>

              {/* 8. Estado Civil */}
              <div>
                <label htmlFor="maritalStatus" className={labelBaseClass}>
                  Estado Civil
                </label>
                <select
                  id="maritalStatus"
                  required
                  aria-invalid={Boolean(errors.maritalStatus)}
                  className={`${inputBaseClass} ${
                    errors.maritalStatus ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('maritalStatus')}
                >
                  <option value="">Selecionar sua resposta</option>
                  {MARITAL_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.maritalStatus && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.maritalStatus.message}
                  </p>
                )}
              </div>

              {/* 9. DATA DE NASCIMENTO */}
              <div>
                <label htmlFor="birthDate" className={labelBaseClass}>
                  DATA DE NASCIMENTO
                </label>
                <input
                  id="birthDate"
                  type="date"
                  required
                  aria-invalid={Boolean(errors.birthDate)}
                  className={`${inputBaseClass} tabular-nums ${
                    errors.birthDate ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('birthDate')}
                />
                {errors.birthDate && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.birthDate.message}
                  </p>
                )}
              </div>

              {/* 10. Informe o CNPJ de sua empresa */}
              <div>
                <label htmlFor="cnpj" className={labelBaseClass}>
                  Informe o CNPJ de sua empresa
                </label>
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
                      aria-invalid={Boolean(errors.cnpj)}
                      className={`${inputBaseClass} tabular-nums ${
                        errors.cnpj ? 'border-red-500' : 'border-slate-300'
                      }`}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                    />
                  )}
                />
                {errors.cnpj && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.cnpj.message}
                  </p>
                )}
              </div>

              {/* 11. Informe endereço da sua empresa */}
              <div>
                <label htmlFor="companyAddress" className={labelBaseClass}>
                  Informe endereço da sua empresa
                </label>
                <input
                  id="companyAddress"
                  type="text"
                  required
                  autoComplete="street-address"
                  aria-invalid={Boolean(errors.companyAddress)}
                  className={`${inputBaseClass} ${
                    errors.companyAddress ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('companyAddress')}
                />
                {errors.companyAddress && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.companyAddress.message}
                  </p>
                )}
              </div>

              {/* 12. Informe o CEP da sua empresa */}
              <div>
                <label htmlFor="companyCep" className={labelBaseClass}>
                  Informe o CEP da sua empresa
                </label>
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
                      autoComplete="postal-code"
                      aria-invalid={Boolean(errors.companyCep)}
                      className={`${inputBaseClass} tabular-nums ${
                        errors.companyCep ? 'border-red-500' : 'border-slate-300'
                      }`}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(formatCEP(e.target.value))}
                    />
                  )}
                />
                {errors.companyCep && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.companyCep.message}
                  </p>
                )}
              </div>

              {/* 13. Nome completo do Pai */}
              <div>
                <label htmlFor="fatherName" className={labelBaseClass}>
                  Nome completo do Pai
                </label>
                <input
                  id="fatherName"
                  type="text"
                  required
                  aria-invalid={Boolean(errors.fatherName)}
                  className={`${inputBaseClass} ${
                    errors.fatherName ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('fatherName')}
                />
                {errors.fatherName && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.fatherName.message}
                  </p>
                )}
              </div>

              {/* 14. Nome completo da Mãe */}
              <div>
                <label htmlFor="motherName" className={labelBaseClass}>
                  Nome completo da Mãe
                </label>
                <input
                  id="motherName"
                  type="text"
                  required
                  aria-invalid={Boolean(errors.motherName)}
                  className={`${inputBaseClass} ${
                    errors.motherName ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('motherName')}
                />
                {errors.motherName && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.motherName.message}
                  </p>
                )}
              </div>

              {/* 15. Informe seu Email */}
              <div>
                <label htmlFor="email" className={labelBaseClass}>
                  Informe seu Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  className={`${inputBaseClass} ${
                    errors.email ? 'border-red-500' : 'border-slate-300'
                  }`}
                  {...register('email')}
                />
                {errors.email && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* 16. Informe o seu Telefone com DDD */}
              <div>
                <label htmlFor="phone" className={labelBaseClass}>
                  Informe o seu Telefone com DDD
                </label>
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
                      className={`${inputBaseClass} tabular-nums ${
                        errors.phone ? 'border-red-500' : 'border-slate-300'
                      }`}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
                  )}
                />
                {errors.phone && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] active:bg-[#0B1F33] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[15px] transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2942]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Enviar</span>
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-slate-500">
                  Seus dados são utilizados pela Ameta exclusivamente para este cadastro inicial, em conformidade com a LGPD.
                </p>
              </div>
            </form>
          </section>
        )}
      </main>

      <footer className="py-6 px-4 text-center text-xs text-slate-500">
        <span>© {new Date().getFullYear()} Ameta</span>
        <span aria-hidden="true" className="mx-2">
          ·
        </span>
        <a
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/admin');
          }}
          className="hover:text-slate-800 hover:underline transition-colors"
        >
          Área administrativa
        </a>
      </footer>
    </div>
  );
}
