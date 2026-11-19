import { CheckCircle2, Download, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createTermoWithAudit,
  extractFriendlyFirestoreMessage,
  lookupCnpjBrasilApiClient,
} from '../services/firestoreService.ts';
import {
  formatCurrencyBRL,
  formatCurrencyInputMask,
  formatLocalDatePtBR,
  getDefaultMonthYearPt,
  integerToFeminineWordsPt,
  numberToCurrencyWordsPt,
  parseCurrencyBRL,
} from '../shared/numberToWordsPt.ts';
import type {
  ContractorRegistrationDetail,
  DiscountTermGenerateInput,
  DiscountTermTemplateFields,
  PanelUserProfile,
} from '../shared/schema.ts';
import { formatCEP, formatCNPJ, onlyDigits } from '../shared/validators.ts';
import { exportDiscountTermToDocx } from '../utils/discountTermDocx.ts';
import { exportDiscountTermToPdf } from '../utils/discountTermPdf.ts';

interface DiscountTermModalProps {
  registration: ContractorRegistrationDetail;
  currentUser: PanelUserProfile;
  onClose: () => void;
  onTermCreated: () => void;
}

type PaymentMode = 'integral' | 'parcelado' | 'blank';

interface BlankFlags {
  razaoSocial: boolean;
  cnpj: boolean;
  endereco: boolean;
  valorTotal: boolean;
  valorExtenso: boolean;
  numParcelas: boolean;
  numParcelasExtenso: boolean;
  valorParcela: boolean;
  mesAnoInicio: boolean;
  localData: boolean;
}

const BLANK_LINE_LONG = '______________________________';
const BLANK_LINE_MED = '__________________';
const BLANK_LINE_SHORT = '________';

export function DiscountTermModal({
  registration,
  currentUser,
  onClose,
  onTermCreated,
}: DiscountTermModalProps) {
  const formattedCnpj = formatCNPJ(registration.cnpj) || registration.cnpj;
  const formattedCep = formatCEP(registration.companyCep) || registration.companyCep;
  const defaultAddress = `${registration.companyAddress} - CEP: ${formattedCep}`;

  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpjLookupStatus, setCnpjLookupStatus] = useState<'loading' | 'found' | 'not_found'>(
    'loading'
  );
  const [cnpjValue, setCnpjValue] = useState(formattedCnpj);
  const [enderecoValue, setEnderecoValue] = useState(defaultAddress);

  const [valorTotalDisplay, setValorTotalDisplay] = useState('');
  const [valorExtenso, setValorExtenso] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('integral');
  const [numParcelas, setNumParcelas] = useState('2');
  const [numParcelasExtenso, setNumParcelasExtenso] = useState('duas');
  const [valorParcelaDisplay, setValorParcelaDisplay] = useState('');
  const [mesAnoInicio, setMesAnoInicio] = useState(() => getDefaultMonthYearPt());
  const [localDate, setLocalDate] = useState(() => formatLocalDatePtBR());

  const [blanks, setBlanks] = useState<BlankFlags>({
    razaoSocial: false,
    cnpj: false,
    endereco: false,
    valorTotal: false,
    valorExtenso: false,
    numParcelas: false,
    numParcelasExtenso: false,
    valorParcela: false,
    mesAnoInicio: false,
    localData: false,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [generatingFormat, setGeneratingFormat] = useState<'docx' | 'pdf' | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchRazaoSocialByCnpj = async () => {
    const digits = onlyDigits(cnpjValue);
    if (digits.length !== 14) {
      setCnpjLookupStatus('not_found');
      return;
    }

    setCnpjLookupStatus('loading');
    const response = await lookupCnpjBrasilApiClient(digits);
    if (response.found && response.razaoSocial) {
      setRazaoSocial(response.razaoSocial);
      setCnpjLookupStatus('found');
    } else {
      setCnpjLookupStatus('not_found');
    }
  };

  useEffect(() => {
    let active = true;
    const digits = onlyDigits(registration.cnpj);
    if (digits.length !== 14) {
      setCnpjLookupStatus('not_found');
      return;
    }

    setCnpjLookupStatus('loading');
    void lookupCnpjBrasilApiClient(digits).then((response) => {
      if (!active) return;
      if (response.found && response.razaoSocial) {
        setRazaoSocial(response.razaoSocial);
        setCnpjLookupStatus('found');
      } else {
        setRazaoSocial('');
        setCnpjLookupStatus('not_found');
      }
    });

    return () => {
      active = false;
    };
  }, [registration.cnpj]);

  const recalcInstallmentValue = (totalStr: string, parcelasStr: string) => {
    const total = parseCurrencyBRL(totalStr);
    const count = Number.parseInt(parcelasStr.replace(/\D/g, ''), 10);
    if (total !== null && total > 0 && Number.isFinite(count) && count >= 1) {
      const perInstallment = total / count;
      setValorParcelaDisplay(formatCurrencyBRL(perInstallment));
    }
  };

  const handleValorTotalChange = (rawInput: string) => {
    const masked = formatCurrencyInputMask(rawInput);
    setValorTotalDisplay(masked);
    setValidationError(null);

    if (!masked) {
      setValorExtenso('');
      setValorParcelaDisplay('');
      return;
    }

    const numeric = parseCurrencyBRL(masked);
    if (numeric !== null) {
      setValorExtenso(numberToCurrencyWordsPt(numeric));
      recalcInstallmentValue(masked, numParcelas);
    }
  };

  const handleNumParcelasChange = (rawInput: string) => {
    const digits = rawInput.replace(/\D/g, '').slice(0, 3);
    setNumParcelas(digits);
    setValidationError(null);

    const parsed = Number.parseInt(digits, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      setNumParcelasExtenso(integerToFeminineWordsPt(parsed));
      recalcInstallmentValue(valorTotalDisplay, digits);
    } else {
      setNumParcelasExtenso('');
      setValorParcelaDisplay('');
    }
  };

  const toggleBlank = (field: keyof BlankFlags) => {
    setBlanks((prev) => ({ ...prev, [field]: !prev[field] }));
    setValidationError(null);
  };

  const buildTemplatePayload = (
    requestedFormat: 'docx' | 'pdf'
  ): DiscountTermGenerateInput | null => {
    if (!blanks.razaoSocial && !razaoSocial.trim()) {
      setValidationError(
        'Informe a Razão Social da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.cnpj && !cnpjValue.trim()) {
      setValidationError(
        'Informe o CNPJ da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.endereco && !enderecoValue.trim()) {
      setValidationError(
        'Informe o endereço da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.valorTotal && !valorTotalDisplay.trim()) {
      setValidationError(
        'Informe o Valor total (R$) ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.valorExtenso && !valorExtenso.trim()) {
      setValidationError(
        'Informe o Valor por extenso ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }

    if (paymentMode === 'parcelado') {
      if (!blanks.numParcelas && (!numParcelas.trim() || Number(numParcelas) < 1)) {
        setValidationError(
          'Informe o número de parcelas (mínimo 1) ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
      if (!blanks.numParcelasExtenso && !numParcelasExtenso.trim()) {
        setValidationError(
          'Informe o número de parcelas por extenso ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
      if (!blanks.valorParcela && !valorParcelaDisplay.trim()) {
        setValidationError(
          'Informe o valor de cada parcela ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
    }

    if (!blanks.mesAnoInicio && !mesAnoInicio.trim()) {
      setValidationError(
        'Informe o Mês/ano de início do abatimento ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.localData && !localDate.trim()) {
      setValidationError(
        'Informe o Local e data ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }

    const marcaIntegral = paymentMode === 'integral' ? '☒' : '☐';
    const marcaParcelado = paymentMode === 'parcelado' ? '☒' : '☐';

    let finalNumParcelas = '—';
    let finalNumParcelasExtenso = '—';
    let finalValorParcela = '—';

    if (paymentMode === 'parcelado') {
      finalNumParcelas = blanks.numParcelas ? BLANK_LINE_SHORT : numParcelas.trim();
      finalNumParcelasExtenso = blanks.numParcelasExtenso
        ? BLANK_LINE_MED
        : numParcelasExtenso.trim();
      finalValorParcela = blanks.valorParcela ? BLANK_LINE_MED : valorParcelaDisplay.trim();
    } else if (paymentMode === 'blank') {
      finalNumParcelas = BLANK_LINE_SHORT;
      finalNumParcelasExtenso = BLANK_LINE_MED;
      finalValorParcela = BLANK_LINE_MED;
    }

    const finalCompanyName = blanks.razaoSocial ? BLANK_LINE_LONG : razaoSocial.trim();
    const finalCnpj = blanks.cnpj ? BLANK_LINE_MED : cnpjValue.trim();
    const finalAddress = blanks.endereco ? BLANK_LINE_LONG : enderecoValue.trim();
    const finalTotalDisplay = blanks.valorTotal ? BLANK_LINE_MED : valorTotalDisplay.trim();
    const finalTotalWords = blanks.valorExtenso ? BLANK_LINE_LONG : valorExtenso.trim();
    const finalStartMonthYear = blanks.mesAnoInicio ? BLANK_LINE_SHORT : mesAnoInicio.trim();
    const finalLocalDate = blanks.localData ? BLANK_LINE_LONG : localDate.trim();

    const templateFields: DiscountTermTemplateFields = {
      CONTRATADA_RAZAO_SOCIAL: finalCompanyName,
      CONTRATADA_CNPJ: finalCnpj,
      CONTRATADA_ENDERECO: finalAddress,
      VALOR_TOTAL: finalTotalDisplay,
      VALOR_EXTENSO: finalTotalWords,
      MARCA_INTEGRAL: marcaIntegral,
      MARCA_PARCELADO: marcaParcelado,
      NUM_PARCELAS: finalNumParcelas,
      NUM_PARCELAS_EXTENSO: finalNumParcelasExtenso,
      VALOR_PARCELA: finalValorParcela,
      MES_ANO_INICIO: finalStartMonthYear,
      LOCAL_DATA: finalLocalDate,
    };

    return {
      paymentMode,
      totalValueDisplay: blanks.valorTotal ? '' : valorTotalDisplay.trim(),
      totalValueWords: blanks.valorExtenso ? '' : valorExtenso.trim(),
      installmentsCount:
        paymentMode === 'parcelado' && !blanks.numParcelas ? numParcelas.trim() : '',
      installmentsWords:
        paymentMode === 'parcelado' && !blanks.numParcelasExtenso
          ? numParcelasExtenso.trim()
          : '',
      installmentValueDisplay:
        paymentMode === 'parcelado' && !blanks.valorParcela ? valorParcelaDisplay.trim() : '',
      startMonthYear: blanks.mesAnoInicio ? '' : mesAnoInicio.trim(),
      localDate: blanks.localData ? '' : localDate.trim(),
      contractorCompanyName: blanks.razaoSocial ? '' : razaoSocial.trim(),
      contractorCnpj: blanks.cnpj ? '' : cnpjValue.trim(),
      contractorAddress: blanks.endereco ? '' : enderecoValue.trim(),
      templateFields,
      requestedFormat,
    };
  };

  const handleGenerate = async (format: 'docx' | 'pdf') => {
    setValidationError(null);
    setSuccessMessage(null);

    const payload = buildTemplatePayload(format);
    if (!payload) return;

    setGeneratingFormat(format);
    try {
      const savedTerm = await createTermoWithAudit({
        cadastroId: registration.id,
        input: payload,
        actor: currentUser,
      });

      onTermCreated();

      if (format === 'docx') {
        await exportDiscountTermToDocx(
          savedTerm.templateFields,
          savedTerm.contractorCompanyName || registration.fullName
        );
        setSuccessMessage('Termo em Word (.docx) gerado no navegador, salvo no histórico e baixado.');
      } else {
        exportDiscountTermToPdf(
          savedTerm.templateFields,
          savedTerm.contractorCompanyName || registration.fullName
        );
        setSuccessMessage('Termo em PDF gerado no navegador, salvo no histórico e baixado.');
      }
    } catch (err) {
      setValidationError(
        extractFriendlyFirestoreMessage(err, 'Não foi possível gerar o termo.')
      );
    } finally {
      setGeneratingFormat(null);
    }
  };

  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-400 disabled:cursor-not-allowed';

  const renderBlankToggle = (field: keyof BlankFlags, idSuffix: string) => (
    <label
      htmlFor={`blank-${idSuffix}`}
      className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none"
    >
      <input
        id={`blank-${idSuffix}`}
        type="checkbox"
        checked={blanks[field]}
        onChange={() => toggleBlank(field)}
        className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0F2942] focus:ring-[#0F2942]/30"
      />
      <span>Deixar em branco para preencher à mão</span>
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-term-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2
              id="discount-term-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Gerar Termo de Autorização de Desconto
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prestador: <span className="font-medium text-slate-700 dark:text-slate-300">{registration.fullName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de geração de termo"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {validationError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {validationError}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dados da Contratada (PJ)
            </h3>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="term-razao-social"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Razão Social da Contratada
                </label>
                {renderBlankToggle('razaoSocial', 'razao-social')}
              </div>

              <div className="flex gap-2">
                <input
                  id="term-razao-social"
                  type="text"
                  disabled={blanks.razaoSocial}
                  value={blanks.razaoSocial ? '' : razaoSocial}
                  onChange={(e) => {
                    setRazaoSocial(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder={
                    blanks.razaoSocial
                      ? 'Em branco para preencher à mão'
                      : cnpjLookupStatus === 'loading'
                        ? 'Buscando Razão Social na BrasilAPI...'
                        : 'Digite a Razão Social da empresa'
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={blanks.razaoSocial || cnpjLookupStatus === 'loading'}
                  onClick={() => void fetchRazaoSocialByCnpj()}
                  title="Buscar Razão Social novamente pelo CNPJ"
                  className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {cnpjLookupStatus === 'loading' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">Buscar CNPJ</span>
                </button>
              </div>
              {cnpjLookupStatus === 'not_found' && !razaoSocial && !blanks.razaoSocial && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Não foi possível localizar a Razão Social automaticamente pelo CNPJ. Digite manualmente ou marque para preencher à mão.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="term-cnpj"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    CNPJ
                  </label>
                  {renderBlankToggle('cnpj', 'cnpj')}
                </div>
                <input
                  id="term-cnpj"
                  type="text"
                  disabled={blanks.cnpj}
                  value={blanks.cnpj ? '' : cnpjValue}
                  onChange={(e) => setCnpjValue(formatCNPJ(e.target.value))}
                  placeholder={blanks.cnpj ? 'Em branco para preencher à mão' : ''}
                  className={`${inputClass} font-mono tabular-nums`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="term-mes-ano"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Mês/ano de início do abatimento
                  </label>
                  {renderBlankToggle('mesAnoInicio', 'mes-ano')}
                </div>
                <input
                  id="term-mes-ano"
                  type="text"
                  disabled={blanks.mesAnoInicio}
                  value={blanks.mesAnoInicio ? '' : mesAnoInicio}
                  onChange={(e) => setMesAnoInicio(e.target.value)}
                  placeholder={blanks.mesAnoInicio ? 'Em branco para preencher à mão' : 'Ex: 11/2026'}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="term-endereco"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Endereço completo (com CEP)
                </label>
                {renderBlankToggle('endereco', 'endereco')}
              </div>
              <input
                id="term-endereco"
                type="text"
                disabled={blanks.endereco}
                value={blanks.endereco ? '' : enderecoValue}
                onChange={(e) => setEnderecoValue(e.target.value)}
                placeholder={blanks.endereco ? 'Em branco para preencher à mão' : ''}
                className={inputClass}
              />
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valor e Forma de Desconto
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="term-valor-total"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Valor total (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    R$
                  </span>
                  <input
                    id="term-valor-total"
                    type="text"
                    inputMode="numeric"
                    disabled={blanks.valorTotal}
                    value={blanks.valorTotal ? '' : valorTotalDisplay}
                    onChange={(e) => handleValorTotalChange(e.target.value)}
                    placeholder={blanks.valorTotal ? 'Em branco' : '0,00'}
                    className={`${inputClass} pl-9 font-mono tabular-nums`}
                  />
                </div>
                {renderBlankToggle('valorTotal', 'valor-total')}
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="term-valor-extenso"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Valor por extenso
                  </label>
                  {renderBlankToggle('valorExtenso', 'valor-extenso')}
                </div>
                <input
                  id="term-valor-extenso"
                  type="text"
                  disabled={blanks.valorExtenso}
                  value={blanks.valorExtenso ? '' : valorExtenso}
                  onChange={(e) => setValorExtenso(e.target.value)}
                  placeholder={
                    blanks.valorExtenso
                      ? 'Em branco para preencher à mão'
                      : 'Preenchido automaticamente ao digitar o valor'
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Forma de abatimento
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMode === 'integral'
                      ? 'border-[#0F2942] dark:border-slate-300 bg-slate-50 dark:bg-slate-800/80'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    value="integral"
                    checked={paymentMode === 'integral'}
                    onChange={() => {
                      setPaymentMode('integral');
                      setValidationError(null);
                    }}
                    className="h-4 w-4 text-[#0F2942]"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Integralmente em uma única nota
                  </span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMode === 'parcelado'
                      ? 'border-[#0F2942] dark:border-slate-300 bg-slate-50 dark:bg-slate-800/80'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    value="parcelado"
                    checked={paymentMode === 'parcelado'}
                    onChange={() => {
                      setPaymentMode('parcelado');
                      setValidationError(null);
                      recalcInstallmentValue(valorTotalDisplay, numParcelas);
                    }}
                    className="h-4 w-4 text-[#0F2942]"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Parcelado
                  </span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMode === 'blank'
                      ? 'border-[#0F2942] dark:border-slate-300 bg-slate-50 dark:bg-slate-800/80'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    value="blank"
                    checked={paymentMode === 'blank'}
                    onChange={() => {
                      setPaymentMode('blank');
                      setValidationError(null);
                    }}
                    className="h-4 w-4 text-[#0F2942]"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Deixar em branco para preencher à mão
                  </span>
                </label>
              </div>
            </div>

            {paymentMode === 'parcelado' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
                <div className="space-y-1.5">
                  <label
                    htmlFor="term-num-parcelas"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Número de parcelas
                  </label>
                  <input
                    id="term-num-parcelas"
                    type="text"
                    inputMode="numeric"
                    disabled={blanks.numParcelas}
                    value={blanks.numParcelas ? '' : numParcelas}
                    onChange={(e) => handleNumParcelasChange(e.target.value)}
                    placeholder={blanks.numParcelas ? 'Em branco' : 'Ex: 3'}
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                  {renderBlankToggle('numParcelas', 'num-parcelas')}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="term-num-parcelas-extenso"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Parcelas por extenso
                  </label>
                  <input
                    id="term-num-parcelas-extenso"
                    type="text"
                    disabled={blanks.numParcelasExtenso}
                    value={blanks.numParcelasExtenso ? '' : numParcelasExtenso}
                    onChange={(e) => setNumParcelasExtenso(e.target.value)}
                    placeholder={blanks.numParcelasExtenso ? 'Em branco' : 'Ex: duas'}
                    className={inputClass}
                  />
                  {renderBlankToggle('numParcelasExtenso', 'num-parcelas-extenso')}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="term-valor-parcela"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Valor de cada parcela (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      R$
                    </span>
                    <input
                      id="term-valor-parcela"
                      type="text"
                      inputMode="numeric"
                      disabled={blanks.valorParcela}
                      value={blanks.valorParcela ? '' : valorParcelaDisplay}
                      onChange={(e) =>
                        setValorParcelaDisplay(formatCurrencyInputMask(e.target.value))
                      }
                      placeholder={blanks.valorParcela ? 'Em branco' : '0,00'}
                      className={`${inputClass} pl-9 font-mono tabular-nums`}
                    />
                  </div>
                  {renderBlankToggle('valorParcela', 'valor-parcela')}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="term-local-data"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Local e data
                </label>
                {renderBlankToggle('localData', 'local-data')}
              </div>
              <input
                id="term-local-data"
                type="text"
                disabled={blanks.localData}
                value={blanks.localData ? '' : localDate}
                onChange={(e) => setLocalDate(e.target.value)}
                placeholder={
                  blanks.localData
                    ? 'Em branco para preencher à mão'
                    : 'Ex: São Paulo, 18 de novembro de 2026'
                }
                className={inputClass}
              />
            </div>
          </section>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={generatingFormat !== null}
            onClick={onClose}
            className="inline-flex h-10 items-center px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Fechar
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={generatingFormat !== null}
              onClick={() => void handleGenerate('pdf')}
              className="inline-flex h-10 items-center gap-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {generatingFormat === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Baixar PDF</span>
            </button>

            <button
              type="button"
              disabled={generatingFormat !== null}
              onClick={() => void handleGenerate('docx')}
              className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {generatingFormat === 'docx' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Baixar Word (.docx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
