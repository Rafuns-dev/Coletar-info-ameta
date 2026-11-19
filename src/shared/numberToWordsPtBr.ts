const UNITS = [
  '',
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
  '',
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

function threeDigitsToWords(n: number, feminine = false): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (rem > 0) {
    if (rem < 10) {
      parts.push((feminine ? UNITS_FEM : UNITS)[rem]);
    } else if (rem < 20) {
      parts.push(TEENS[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const u = rem % 10;
      if (u === 0) {
        parts.push(TENS[t]);
      } else {
        parts.push(`${TENS[t]} e ${(feminine ? UNITS_FEM : UNITS)[u]}`);
      }
    }
  }

  return parts.join(' e ');
}

export function integerToWordsPtBr(num: number, feminine = false): string {
  const n = Math.floor(Math.abs(num));
  if (!Number.isFinite(n) || n === 0) return 'zero';
  if (n > 999_999_999) return String(n);

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  const groups: Array<{ value: number; text: string }> = [];

  if (millions > 0) {
    const label = millions === 1 ? 'milhão' : 'milhões';
    groups.push({ value: millions * 1_000_000, text: `${threeDigitsToWords(millions)} ${label}` });
  }

  if (thousands > 0) {
    if (thousands === 1) {
      groups.push({ value: 1_000, text: 'mil' });
    } else {
      groups.push({ value: thousands * 1_000, text: `${threeDigitsToWords(thousands)} mil` });
    }
  }

  if (rest > 0) {
    groups.push({ value: rest, text: threeDigitsToWords(rest, feminine) });
  }

  if (groups.length === 1) {
    return groups[0].text;
  }

  if (groups.length === 2) {
    const second = groups[1];
    const sep = second.value < 100 || second.value % 100 === 0 ? ' e ' : ' ';
    return `${groups[0].text}${sep}${second.text}`;
  }

  const last = groups[2];
  const sep = last.value < 100 || last.value % 100 === 0 ? ' e ' : ' ';
  return `${groups[0].text}, ${groups[1].text}${sep}${last.text}`;
}

export function currencyToWordsPtBr(amountReais: number): string {
  if (!Number.isFinite(amountReais) || amountReais < 0) return '';
  const totalCents = Math.round(amountReais * 100);
  if (totalCents === 0) return 'zero reais';

  const reais = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  const parts: string[] = [];

  if (reais > 0) {
    const reaisWords = integerToWordsPtBr(reais, false);
    const millionsExact = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const unit = reais === 1 ? 'real' : millionsExact ? 'de reais' : 'reais';
    parts.push(`${reaisWords} ${unit}`);
  }

  if (cents > 0) {
    const centsWords = integerToWordsPtBr(cents, false);
    const unit = cents === 1 ? 'centavo' : 'centavos';
    parts.push(`${centsWords} ${unit}`);
  }

  return parts.join(' e ');
}

export function parseBrazilianCurrency(raw: string): number | null {
  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

export function formatBRL(amountReais: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountReais);
}

export function formatTodayLocalDatePtBr(city = 'São Paulo'): string {
  const now = new Date();
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(now);
  return `${city}, ${formattedDate}`;
}

export function formatDefaultMesAnoPtBr(): string {
  const now = new Date();
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(now);
  const year = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(now);
  return `${month}/${year}`;
}
