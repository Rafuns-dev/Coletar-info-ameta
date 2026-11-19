import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  createTermoWithAudit,
  extractFriendlyFirestoreMessage,
  getLatestTermDocumentsByCadastro,
  lookupCnpjBrasilApiClient,
} from '../services/firestoreService.ts';
import {
  DISCOUNT_TERM_DOCUMENT_OPTIONS,
  formatSelectedDocumentsCountLabel,
  orderDiscountTermDocuments,
  splitTermDocumentsIntoStandardAndCustom,
  type CustomDiscountTermDocument,
} from '../shared/discountTermDocuments.ts';
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
import { AmetaLogo } from './AmetaLogo.tsx';
import { useToast } from './ToastProvider.tsx';

interface DiscountTermModalProps {
  registration: ContractorRegistrationDetail;
  currentUser: PanelUserProfile;
  lastTermDocuments?: string[];
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
  lastTermDocuments,
  onClose,
  onTermCreated,
}: DiscountTermModalProps) {
  const { showToast } = useToast();

  const formattedCnpj = formatCNPJ(registration.cnpj) || registration.cnpj;
  const formattedCep = formatCEP(registration.companyCep) || registration.companyCep;
  const defaultAddress = `${registration.companyAddress} - CEP: ${formattedCep}`;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpjLookupStatus, setCnpjLookupStatus] = useState<'loading' | 'found' | 'not_found'>(
    'loading'
  );
  const [cnpjValue, setCnpjValue] = useState(formattedCnpj);
  const [enderecoValue, setEnderecoValue] = useState(defaultAddress);

  // Documentos elaborados (objeto do desconto) — todos começam DESMARCADOS
  const [selectedStandardDocs, setSelectedStandardDocs] = useState<string[]>([]);
  const [customDocs, setCustomDocs] = useState<CustomDiscountTermDocument[]>([]);
  const [newCustomDocText, setNewCustomDocText] = useState('');
  const [latestSavedTermDocs, setLatestSavedTermDocs] = useState<string[]>(
    () => lastTermDocuments ?? []
  );

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

  const orderedSelectedDocuments = useMemo(
    () => orderDiscountTermDocuments(selectedStandardDocs, customDocs),
    [selectedStandardDocs, customDocs]
  );

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
      showToast('Razão Social localizada pelo CNPJ.', 'info');
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

  useEffect(() => {
    if (lastTermDocuments !== undefined) {
      setLatestSavedTermDocs(lastTermDocuments);
      return;
    }
    let active = true;
    void getLatestTermDocumentsByCadastro(registration.id)
      .then((docs) => {
        if (active && docs.length > 0) {
          setLatestSavedTermDocs(docs);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [registration.id, lastTermDocuments]);

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

  const toggleStandardDocument = (docLabel: string) => {
    setSelectedStandardDocs((prev) =>
      prev.includes(docLabel) ? prev.filter((item) => item !== docLabel) : [...prev, docLabel]
    );
    setValidationError(null);
  };

  const toggleCustomDocument = (customId: string) => {
    setCustomDocs((prev) =>
      prev.map((item) => (item.id === customId ? { ...item, checked: !item.checked } : item))
    );
    setValidationError(null);
  };

  const removeCustomDocument = (customId: string) => {
    setCustomDocs((prev) => prev.filter((item) => item.id !== customId));
    setValidationError(null);
  };

  const handleSelectAllDocuments = () => {
    setSelectedStandardDocs([...DISCOUNT_TERM_DOCUMENT_OPTIONS]);
    setCustomDocs((prev) => prev.map((item) => ({ ...item, checked: true })));
    setValidationError(null);
  };

  const handleClearDocumentsSelection = () => {
    setSelectedStandardDocs([]);
    setCustomDocs((prev) => prev.map((item) => ({ ...item, checked: false })));
  };

  const handleUseLastTermSelection = () => {
    if (latestSavedTermDocs.length === 0) return;
    const { standardSelected, customDocuments } =
      splitTermDocumentsIntoStandardAndCustom(latestSavedTermDocs);
    setSelectedStandardDocs(standardSelected);
    setCustomDocs(customDocuments);
    setValidationError(null);
    showToast('Seleção de documentos do último termo aplicada.', 'info');
  };

  const handleAddCustomDocument = () => {
    const clean = newCustomDocText.trim();
    if (!clean) return;
    if (clean.length > 300) {
      setValidationError('O nome do documento adicionado pode ter no máximo 300 caracteres.');
      return;
    }

    const normalized = clean.replace(/\u2011/g, '-').toLowerCase();
    const matchingStandard = DISCOUNT_TERM_DOCUMENT_OPTIONS.find(
      (opt) => opt.replace(/\u2011/g, '-').toLowerCase() === normalized
    );
    if (matchingStandard) {
      if (!selectedStandardDocs.includes(matchingStandard)) {
        setSelectedStandardDocs((prev) => [...prev, matchingStandard]);
      }
      setNewCustomDocText('');
      setValidationError(null);
      return;
    }

    const matchingCustom = customDocs.find(
      (item) => item.label.replace(/\u2011/g, '-').toLowerCase() === normalized
    );
    if (matchingCustom) {
      setCustomDocs((prev) =>
        prev.map((item) => (item.id === matchingCustom.id ? { ...item, checked: true } : item))
      );
      setNewCustomDocText('');
      setValidationError(null);
      return;
    }

    const newItem: CustomDiscountTermDocument = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: clean,
      checked: true,
    };
    setCustomDocs((prev) => [...prev, newItem]);
    setNewCustomDocText('');
    setValidationError(null);
  };

  const buildTemplatePayload = (
    requestedFormat: 'docx' | 'pdf'
  ): DiscountTermGenerateInput | null => {
    if (step === 2 && orderedSelectedDocuments.length === 0) {
      setValidationError(
        'Selecione pelo menos um documento em "Documentos elaborados (objeto do desconto)" para gerar o termo.'
      );
      return null;
    }

    if (!blanks.razaoSocial && !razaoSocial.trim()) {
      setStep(1);
      setValidationError(
        'Informe a Razão Social da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.cnpj && !cnpjValue.trim()) {
      setStep(1);
      setValidationError(
        'Informe o CNPJ da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.endereco && !enderecoValue.trim()) {
      setStep(1);
      setValidationError(
        'Informe o endereço da Contratada ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }

    if (orderedSelectedDocuments.length === 0) {
      setStep(2);
      setValidationError(
        'Selecione pelo menos um documento em "Documentos elaborados (objeto do desconto)" para gerar o termo.'
      );
      return null;
    }

    if (!blanks.valorTotal && !valorTotalDisplay.trim()) {
      setStep(3);
      setValidationError(
        'Informe o Valor total (R$) ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.valorExtenso && !valorExtenso.trim()) {
      setStep(3);
      setValidationError(
        'Informe o Valor por extenso ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }

    if (paymentMode === 'parcelado') {
      if (!blanks.numParcelas && (!numParcelas.trim() || Number(numParcelas) < 1)) {
        setStep(3);
        setValidationError(
          'Informe o número de parcelas (mínimo 1) ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
      if (!blanks.numParcelasExtenso && !numParcelasExtenso.trim()) {
        setStep(3);
        setValidationError(
          'Informe o número de parcelas por extenso ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
      if (!blanks.valorParcela && !valorParcelaDisplay.trim()) {
        setStep(3);
        setValidationError(
          'Informe o valor de cada parcela ou marque "Deixar em branco para preencher à mão".'
        );
        return null;
      }
    }

    if (!blanks.mesAnoInicio && !mesAnoInicio.trim()) {
      setStep(3);
      setValidationError(
        'Informe o Mês/ano de início do abatimento ou marque "Deixar em branco para preencher à mão".'
      );
      return null;
    }
    if (!blanks.localData && !localDate.trim()) {
      setStep(3);
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
      selectedDocuments: orderedSelectedDocuments,
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

      setLatestSavedTermDocs(savedTerm.selectedDocuments);
      onTermCreated();

      if (format === 'docx') {
        await exportDiscountTermToDocx(
          savedTerm.templateFields,
          savedTerm.contractorCompanyName || registration.fullName,
          savedTerm.selectedDocuments
        );
        const msg = 'Termo em Word (.docx) gerado, salvo no histórico e baixado.';
        setSuccessMessage(msg);
        showToast(msg, 'success');
      } else {
        exportDiscountTermToPdf(
          savedTerm.templateFields,
          savedTerm.contractorCompanyName || registration.fullName,
          savedTerm.selectedDocuments
        );
        const msg = 'Termo em PDF gerado, salvo no histórico e baixado.';
        setSuccessMessage(msg);
        showToast(msg, 'success');
      }
    } catch (err) {
      const msg = extractFriendlyFirestoreMessage(err, 'Não foi possível gerar o termo.');
      setValidationError(msg);
      showToast(msg, 'error');
    } finally {
      setGeneratingFormat(null);
    }
  };

  const inputClass =
    'w-full h-11 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15 disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed transition-colors';

  const renderBlankToggle = (field: keyof BlankFlags, idSuffix: string) => (
    <label
      htmlFor={`blank-${idSuffix}`}
      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none"
    >
      <input
        id={`blank-${idSuffix}`}
        type="checkbox"
        checked={blanks[field]}
        onChange={() => toggleBlank(field)}
        className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
      />
      <span>Deixar em branco para preencher à mão</span>
    </label>
  );

  // Valores para a prévia ao vivo
  const previewRazao = blanks.razaoSocial
    ? BLANK_LINE_LONG
    : razaoSocial.trim() || '______________________________';
  const previewCnpj = blanks.cnpj ? BLANK_LINE_MED : cnpjValue.trim() || '__________________';
  const previewEndereco = blanks.endereco
    ? BLANK_LINE_LONG
    : enderecoValue.trim() || '______________________________';
  const previewValorTotal = blanks.valorTotal
    ? BLANK_LINE_MED
    : valorTotalDisplay.trim() || '0,00';
  const previewValorExtenso = blanks.valorExtenso
    ? BLANK_LINE_LONG
    : valorExtenso.trim() || '______________________________';
  const previewMesAno = blanks.mesAnoInicio
    ? BLANK_LINE_SHORT
    : mesAnoInicio.trim() || '________';
  const previewLocalData = blanks.localData
    ? BLANK_LINE_LONG
    : localDate.trim() || '______________________________';
  const previewIntegralMark = paymentMode === 'integral' ? '☒' : '☐';
  const previewParceladoMark = paymentMode === 'parcelado' ? '☒' : '☐';
  const previewParcelas =
    paymentMode === 'parcelado'
      ? blanks.numParcelas
        ? BLANK_LINE_SHORT
        : numParcelas.trim() || '—'
      : paymentMode === 'blank'
        ? BLANK_LINE_SHORT
        : '—';
  const previewParcelasExtenso =
    paymentMode === 'parcelado'
      ? blanks.numParcelasExtenso
        ? BLANK_LINE_MED
        : numParcelasExtenso.trim() || '—'
      : paymentMode === 'blank'
        ? BLANK_LINE_MED
        : '—';
  const previewValorParcela =
    paymentMode === 'parcelado'
      ? blanks.valorParcela
        ? BLANK_LINE_MED
        : valorParcelaDisplay.trim() || '0,00'
      : paymentMode === 'blank'
        ? BLANK_LINE_MED
        : '—';

  const previewCard = (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-white text-[#1B2340] p-5 shadow-sm text-[12px] leading-relaxed">
      <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-[#E3E7EF]">
        <AmetaLogo size="sm" className="!h-8" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#229A9A]">
          Prévia do Termo
        </span>
      </div>

      <h4 className="text-center font-display text-[13px] font-bold uppercase tracking-wide text-[#1F2E85] mb-3">
        Termo de Autorização de Desconto
      </h4>

      <p className="mb-3">
        <strong>CONTRATADA:</strong>{' '}
        <span className="font-semibold text-[#1F2E85] underline decoration-[#229A9A]/40">
          {previewRazao}
        </span>
        , inscrita no CNPJ sob nº{' '}
        <span className="font-mono font-semibold tabular-nums">{previewCnpj}</span>, com sede em{' '}
        <span className="font-medium">{previewEndereco}</span>.
      </p>

      <div className="rounded-[10px] bg-[#F5F7FB] border border-[#E3E7EF] p-3 mb-3 space-y-1.5">
        <p className="font-bold text-[#1F2E85] text-[11px] uppercase tracking-wider">
          Cláusula Primeira – Do Objeto
        </p>
        <p className="text-[11px] text-[#475569] leading-snug">
          O presente termo tem por objeto a autorização expressa para que a CONTRATANTE realize o
          desconto ou abatimento de valores diretamente nas notas fiscais emitidas pela CONTRATADA,
          referentes aos custos de elaboração, emissão, atualização, manutenção, reemissão e gestão
          de documentos de Segurança e Saúde do Trabalho, exigidos por lei, contrato ou normas
          internas, incluindo, mas não se limitando a:
        </p>
        {orderedSelectedDocuments.length > 0 ? (
          <ul className="list-disc pl-4 space-y-1 pt-1 text-[11px] font-medium text-[#1B2340]">
            {orderedSelectedDocuments.map((docItem) => (
              <li key={docItem}>{docItem}</li>
            ))}
          </ul>
        ) : (
          <p className="pt-1 text-[11px] font-medium text-[#B45309] italic">
            Nenhum documento marcado ainda — selecione ao menos um item na aba Documentos.
          </p>
        )}
      </div>

      <p className="mb-3">
        Autoriza o desconto no valor total de{' '}
        <strong className="font-mono tabular-nums text-[#1F2E85]">R$ {previewValorTotal}</strong>{' '}
        (<span>{previewValorExtenso}</span>), referente à prestação de serviços junto à{' '}
        <strong>CONTRATANTE (Ameta Serviços)</strong>.
      </p>

      <div className="rounded-[10px] bg-[#F5F7FB] border border-[#E3E7EF] p-3 mb-3 space-y-1.5">
        <p className="font-semibold text-[#1B2340] text-[11px] uppercase tracking-wider mb-1">
          Forma de abatimento
        </p>
        <p className="flex items-start gap-2">
          <span className="font-mono text-sm leading-none">{previewIntegralMark}</span>
          <span>Integralmente em uma única nota</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="font-mono text-sm leading-none">{previewParceladoMark}</span>
          <span>
            Parcelado em{' '}
            <strong className="font-mono tabular-nums">{previewParcelas}</strong> (
            <span>{previewParcelasExtenso}</span>) parcelas de{' '}
            <strong className="font-mono tabular-nums">R$ {previewValorParcela}</strong>
          </span>
        </p>
        <p className="pt-1 text-[11.5px] text-[#5E667D]">
          Início do abatimento: <strong className="text-[#1B2340] tabular-nums">{previewMesAno}</strong>
        </p>
      </div>

      <p className="text-right text-[11.5px] text-[#5E667D] mt-4">{previewLocalData}</p>

      <div className="mt-5 pt-3 border-t border-dashed border-[#CBD5E1] text-center text-[10.5px] text-[#7F7F7F]">
        Layout oficial do modelo Word (.docx) e PDF preservado integralmente na geração.
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-term-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-[2px]"
    >
      <div className="animate-modal-expand w-full max-w-5xl max-h-[92vh] bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] shadow-[var(--shadow-elevated)] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 rounded-[10px] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff] flex items-center justify-center shrink-0">
              <ScrollText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="discount-term-modal-title"
                className="font-display text-lg font-bold text-[var(--text-primary)] truncate"
              >
                Gerar Termo de Autorização de Desconto
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                Prestador:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {registration.fullName}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowMobilePreview((prev) => !prev)}
              className="lg:hidden inline-flex h-10 items-center gap-1.5 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-semibold text-[var(--text-primary)]"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showMobilePreview ? 'Formulário' : 'Prévia'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar janela de geração de termo"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Barra de etapas (Wizard 3 passos) */}
        <div className="px-5 sm:px-6 py-3 border-b border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`inline-flex h-9 items-center gap-2 px-3.5 rounded-[10px] text-xs font-semibold transition-colors whitespace-nowrap ${
              step === 1
                ? 'bg-[#1F2E85] text-white shadow-sm'
                : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-[6px] text-[11px] font-bold flex items-center justify-center ${
                step === 1 ? 'bg-[#229A9A] text-white' : 'bg-[var(--surface-subtle)]'
              }`}
            >
              1
            </span>
            <span>Dados da Contratada</span>
          </button>

          <span className="text-[var(--text-muted)] text-xs" aria-hidden="true">
            →
          </span>

          <button
            type="button"
            onClick={() => setStep(2)}
            className={`inline-flex h-9 items-center gap-2 px-3.5 rounded-[10px] text-xs font-semibold transition-colors whitespace-nowrap ${
              step === 2
                ? 'bg-[#1F2E85] text-white shadow-sm'
                : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-[6px] text-[11px] font-bold flex items-center justify-center ${
                step === 2 ? 'bg-[#229A9A] text-white' : 'bg-[var(--surface-subtle)]'
              }`}
            >
              2
            </span>
            <span>Documentos elaborados</span>
            <span
              className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-bold tabular-nums ${
                step === 2
                  ? 'bg-white/20 text-white'
                  : orderedSelectedDocuments.length > 0
                    ? 'bg-[#229A9A]/15 text-[#1b8181] dark:text-[#5eead4]'
                    : 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
              }`}
            >
              {orderedSelectedDocuments.length}
            </span>
          </button>

          <span className="text-[var(--text-muted)] text-xs" aria-hidden="true">
            →
          </span>

          <button
            type="button"
            onClick={() => setStep(3)}
            className={`inline-flex h-9 items-center gap-2 px-3.5 rounded-[10px] text-xs font-semibold transition-colors whitespace-nowrap ${
              step === 3
                ? 'bg-[#1F2E85] text-white shadow-sm'
                : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-[6px] text-[11px] font-bold flex items-center justify-center ${
                step === 3 ? 'bg-[#229A9A] text-white' : 'bg-[var(--surface-subtle)]'
              }`}
            >
              3
            </span>
            <span>Valores, Forma e Data</span>
          </button>
        </div>

        {/* Corpo com Wizard à esquerda e Prévia ao vivo à direita */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {validationError && (
            <div
              role="alert"
              className="mb-5 rounded-[10px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error)] flex items-start gap-2.5"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 rounded-[10px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)] flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Coluna do Wizard */}
            <div className={`lg:col-span-7 space-y-5 ${showMobilePreview ? 'hidden lg:block' : ''}`}>
              {step === 1 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1F2E85] dark:text-[#8fa2ff]">
                      Etapa 1 · Dados da Contratada (PJ)
                    </h3>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="term-razao-social"
                        className="text-xs font-semibold text-[var(--text-primary)]"
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
                        className="ameta-btn-interactive inline-flex h-11 items-center gap-1.5 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {cnpjLookupStatus === 'loading' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 text-[#229A9A]" aria-hidden="true" />
                        )}
                        <span className="hidden sm:inline">Buscar CNPJ</span>
                      </button>
                    </div>
                    {cnpjLookupStatus === 'not_found' && !razaoSocial && !blanks.razaoSocial && (
                      <p className="text-xs text-[var(--status-warning)]">
                        Não foi possível localizar a Razão Social automaticamente pelo CNPJ. Digite manualmente ou marque para preencher à mão.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="term-cnpj"
                        className="text-xs font-semibold text-[var(--text-primary)]"
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
                        htmlFor="term-endereco"
                        className="text-xs font-semibold text-[var(--text-primary)]"
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

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-5 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-white text-xs font-semibold"
                    >
                      <span>Avançar para Documentos</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1F2E85] dark:text-[#8fa2ff]">
                        Documentos elaborados (objeto do desconto)
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Apenas os documentos marcados serão incluídos na Cláusula Primeira do termo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline shrink-0"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Editar Contratada</span>
                    </button>
                  </div>

                  {/* Barra de ações rápidas + contador */}
                  <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        orderedSelectedDocuments.length > 0
                          ? 'text-[#1b8181] dark:text-[#5eead4]'
                          : 'text-[var(--status-warning)]'
                      }`}
                    >
                      {formatSelectedDocumentsCountLabel(orderedSelectedDocuments.length)}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {latestSavedTermDocs.length > 0 && (
                        <button
                          type="button"
                          onClick={handleUseLastTermSelection}
                          className="ameta-btn-interactive inline-flex h-8 items-center gap-1.5 px-2.5 rounded-[8px] border border-[#229A9A]/50 bg-[#229A9A]/10 text-[11.5px] font-semibold text-[#1b8181] dark:text-[#5eead4] hover:bg-[#229A9A]/20"
                        >
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Usar a mesma seleção do último termo</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSelectAllDocuments}
                        className="ameta-btn-interactive inline-flex h-8 items-center px-2.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[11.5px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      >
                        Selecionar todos
                      </button>
                      <button
                        type="button"
                        onClick={handleClearDocumentsSelection}
                        className="ameta-btn-interactive inline-flex h-8 items-center px-2.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[11.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  </div>

                  {/* Lista de checkboxes (12 padrões na ordem exata + adicionados no final) */}
                  <div className="rounded-[12px] border border-[var(--border-default)] divide-y divide-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden">
                    {DISCOUNT_TERM_DOCUMENT_OPTIONS.map((docLabel, index) => {
                      const isChecked = selectedStandardDocs.includes(docLabel);
                      const checkboxId = `term-doc-std-${index}`;
                      return (
                        <label
                          key={docLabel}
                          htmlFor={checkboxId}
                          className={`flex items-start gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-[var(--status-info-bg)]/55'
                              : 'hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleStandardDocument(docLabel)}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85] shrink-0"
                          />
                          <span className="text-xs leading-relaxed text-[var(--text-primary)] select-none">
                            {docLabel}
                          </span>
                        </label>
                      );
                    })}

                    {customDocs.map((customItem) => {
                      const checkboxId = `term-doc-custom-${customItem.id}`;
                      return (
                        <div
                          key={customItem.id}
                          className={`flex items-start justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                            customItem.checked
                              ? 'bg-[#229A9A]/8'
                              : 'hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <label
                            htmlFor={checkboxId}
                            className="flex items-start gap-3 cursor-pointer flex-1 min-w-0"
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={customItem.checked}
                              onChange={() => toggleCustomDocument(customItem.id)}
                              className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] accent-[#229A9A] shrink-0"
                            />
                            <span className="text-xs leading-relaxed text-[var(--text-primary)] break-words">
                              {customItem.label}
                              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[10px] font-semibold text-[var(--text-muted)]">
                                Adicionado
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeCustomDocument(customItem.id)}
                            aria-label={`Remover documento ${customItem.label}`}
                            title="Remover documento adicionado"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-muted)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error)] transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Campo "Adicionar outro documento" */}
                  <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3.5 space-y-2">
                    <label
                      htmlFor="term-add-custom-doc"
                      className="block text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Adicionar outro documento
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="term-add-custom-doc"
                        type="text"
                        maxLength={300}
                        value={newCustomDocText}
                        onChange={(e) => {
                          setNewCustomDocText(e.target.value);
                          setValidationError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomDocument();
                          }
                        }}
                        placeholder="Digite o nome de outro documento para incluir no final da lista..."
                        className={inputClass}
                      />
                      <button
                        type="button"
                        disabled={!newCustomDocText.trim()}
                        onClick={handleAddCustomDocument}
                        className="ameta-btn-interactive inline-flex h-11 items-center gap-1.5 px-4 rounded-[10px] bg-[#229A9A] hover:bg-[#1b8181] text-white text-xs font-semibold disabled:opacity-45 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-4 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Voltar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-5 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-white text-xs font-semibold"
                    >
                      <span>Avançar para Valores e Data</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1F2E85] dark:text-[#8fa2ff]">
                      Etapa 3 · Valores, Forma de Desconto e Data
                    </h3>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Editar Documentos ({orderedSelectedDocuments.length})</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="term-valor-total"
                        className="block text-xs font-semibold text-[var(--text-primary)]"
                      >
                        Valor total (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">
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
                          className={`${inputClass} pl-10 font-mono tabular-nums`}
                        />
                      </div>
                      {renderBlankToggle('valorTotal', 'valor-total')}
                    </div>

                    <div className="sm:col-span-2 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="term-valor-extenso"
                          className="text-xs font-semibold text-[var(--text-primary)]"
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
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">
                      Forma de abatimento
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <label
                        className={`flex items-center gap-2.5 p-3 rounded-[10px] border cursor-pointer transition-colors ${
                          paymentMode === 'integral'
                            ? 'border-[#1F2E85] dark:border-[#229A9A] bg-[var(--status-info-bg)]'
                            : 'border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
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
                          className="h-4 w-4 accent-[#1F2E85]"
                        />
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          Integralmente em uma única nota
                        </span>
                      </label>

                      <label
                        className={`flex items-center gap-2.5 p-3 rounded-[10px] border cursor-pointer transition-colors ${
                          paymentMode === 'parcelado'
                            ? 'border-[#1F2E85] dark:border-[#229A9A] bg-[var(--status-info-bg)]'
                            : 'border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
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
                          className="h-4 w-4 accent-[#1F2E85]"
                        />
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          Parcelado
                        </span>
                      </label>

                      <label
                        className={`flex items-center gap-2.5 p-3 rounded-[10px] border cursor-pointer transition-colors ${
                          paymentMode === 'blank'
                            ? 'border-[#1F2E85] dark:border-[#229A9A] bg-[var(--status-info-bg)]'
                            : 'border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
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
                          className="h-4 w-4 accent-[#1F2E85]"
                        />
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          Deixar em branco para preencher à mão
                        </span>
                      </label>
                    </div>
                  </div>

                  {paymentMode === 'parcelado' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="term-num-parcelas"
                          className="block text-xs font-semibold text-[var(--text-primary)]"
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
                          className="block text-xs font-semibold text-[var(--text-primary)]"
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
                          className="block text-xs font-semibold text-[var(--text-primary)]"
                        >
                          Valor da parcela (R$)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">
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
                            className={`${inputClass} pl-10 font-mono tabular-nums`}
                          />
                        </div>
                        {renderBlankToggle('valorParcela', 'valor-parcela')}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="term-mes-ano"
                          className="text-xs font-semibold text-[var(--text-primary)]"
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
                        placeholder={
                          blanks.mesAnoInicio ? 'Em branco para preencher à mão' : 'Ex: 11/2026'
                        }
                        className={`${inputClass} tabular-nums`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="term-local-data"
                          className="text-xs font-semibold text-[var(--text-primary)]"
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
                  </div>
                </section>
              )}
            </div>

            {/* Coluna da Prévia ao vivo */}
            <div
              className={`lg:col-span-5 ${
                showMobilePreview ? 'block' : 'hidden lg:block'
              } lg:sticky lg:top-0`}
            >
              {previewCard}
            </div>
          </div>
        </div>

        {/* Rodapé com botões finais destacados */}
        <div className="px-5 sm:px-6 py-4 border-t border-[var(--border-default)] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={generatingFormat !== null}
            onClick={onClose}
            className="ameta-btn-interactive inline-flex h-11 items-center px-4 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 whitespace-nowrap"
          >
            Fechar
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={generatingFormat !== null}
              onClick={() => void handleGenerate('pdf')}
              className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-5 rounded-[10px] border border-[#229A9A] bg-[#229A9A]/10 hover:bg-[#229A9A]/20 text-xs font-bold text-[#1b8181] dark:text-[#34d399] disabled:opacity-50 whitespace-nowrap"
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
              className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-5 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-bold text-white shadow-sm disabled:opacity-50 whitespace-nowrap"
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
