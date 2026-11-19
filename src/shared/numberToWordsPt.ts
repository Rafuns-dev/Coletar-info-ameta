const UNITS_MASC = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
];

const UNITS_FEM = [
  'zero',
  'uma',
  'duas',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
];

const TEENS = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];

const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];

const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function groupBelow1000(n: number, feminine: boolean): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (rest > 0) {
    if (rest < 10) {
      parts.push((feminine ? UNITS_FEM : UNITS_MASC)[rest]);
    } else if (rest < 20) {
      parts.push(TEENS[rest - 10]);
    } else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      if (u === 0) {
        parts.push(TENS[t]);
      } else {
        parts.push(`${TENS[t]} e ${(feminine ? UNITS_FEM : UNITS_MASC)[u]}`);
      }
    }
  }

  return parts.join(' e ');
}

function integerToWordsInternal(n: number, feminine: boolean): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const intVal = Math.floor(n);
  if (intVal === 0) return 'zero';
  if (intVal > 999_999_999) return String(intVal);

  const millions = Math.floor(intVal / 1_000_000);
  const thousands = Math.floor((intVal % 1_000_000) / 1_000);
  const units = intVal % 1_000;

  const segments: string[] = [];

  if (millions > 0) {
    const millionText = groupBelow1000(millions, false);
    segments.push(millions === 1 ? `${millionText} milhão` : `${millionText} milhões`);
  }

  if (thousands > 0) {
    if (thousands === 1) {
      segments.push('mil');
    } else {
      segments.push(`${groupBelow1000(thousands, false)} mil`);
    }
  }

  if (units > 0) {
    segments.push(groupBelow1000(units, feminine));
  }

  if (segments.length === 1) {
    return segments[0];
  }

  if (segments.length === 2) {
    if (millions > 0 && thousands === 0 && units === 0) return segments[0];
    if (thousands > 0 && units > 0 && units < 100) {
      return `${segments[0]} e ${segments[1]}`;
    }
    if (thousands > 0 && units > 0 && units % 100 === 0) {
      return `${segments[0]} e ${segments[1]}`;
    }
    if (millions > 0 && thousands === 0 && units > 0) {
      return `${segments[0]} e ${segments[1]}`;
    }
    return segments.join(' ');
  }

  const last = segments[segments.length - 1];
  const prefix = segments.slice(0, -1).join(' ');
  return units < 100 || units % 100 === 0 ? `${prefix} e ${last}` : `${prefix} ${last}`;
}

export function integerToWordsPt(n: number): string {
  return integerToWordsInternal(n, false);
}

export function integerToFeminineWordsPt(n: number): string {
  return integerToWordsInternal(n, true);
}

export function numberToCurrencyWordsPt(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const totalCents = Math.round(amount * 100);
  if (totalCents === 0) return 'zero reais';

  const reais = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  const parts: string[] = [];

  if (reais > 0) {
    const reaisWords = integerToWordsInternal(reais, false);
    const isExactMillion = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const unit = reais === 1 ? 'real' : isExactMillion ? 'de reais' : 'reais';
    parts.push(`${reaisWords} ${unit}`);
  }

  if (cents > 0) {
    const centsWords = integerToWordsInternal(cents, false);
    const centUnit = cents === 1 ? 'centavo' : 'centavos';
    parts.push(`${centsWords} ${centUnit}`);
  }

  return parts.join(' e ');
}

export function formatCurrencyBRL(amount: number): string {
  if (!Number.isFinite(amount)) return '0,00';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function parseCurrencyBRL(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function formatCurrencyInputMask(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits) / 100;
  return formatCurrencyBRL(numeric);
}

export function formatLocalDatePtBR(date = new Date()): string {
  const day = date.getDate();
  const month = MONTHS_PT[date.getMonth()];
  const year = date.getFullYear();
  return `São Paulo, ${day} de ${month} de ${year}`;
}

export function getDefaultMonthYearPt(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
}
