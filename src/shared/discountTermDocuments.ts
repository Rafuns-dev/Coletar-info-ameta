export const DISCOUNT_TERM_DOCUMENT_OPTIONS = [
  'NR‑06 – Equipamento de Proteção Individual (EPI)',
  'NR‑07 – Programa de Controle Médico de Saúde Ocupacional (PCMSO)',
  'Ficha de Entrega e Controle de EPI',
  'PCMSO – Programa de Controle Médico de Saúde Ocupacional',
  'PGR – Programa de Gerenciamento de Riscos',
  'Integração de Segurança do Trabalho',
  'Ordem de Serviço de Segurança e Saúde no Trabalho',
  'NR‑10 – Segurança em Instalações e Serviços em Eletricidade',
  'NR‑35 – Trabalho em Altura',
  'Cartas de Anuência da NR‑10',
  'Cartas de Anuência da NR‑35',
  'Demais Normas Regulamentadoras (NRs), documentos técnicos, formulários e registros exigidos pelos órgãos fiscalizadores ou contratantes.',
] as const;

export interface CustomDiscountTermDocument {
  id: string;
  label: string;
  checked: boolean;
}

function normalizeForLookup(value: string): string {
  return value.trim().replace(/\u2011/g, '-');
}

export function orderDiscountTermDocuments(
  selectedStandard: readonly string[],
  customDocuments: readonly CustomDiscountTermDocument[]
): string[] {
  const selectedSet = new Set(selectedStandard);
  const orderedStandard = DISCOUNT_TERM_DOCUMENT_OPTIONS.filter((item) =>
    selectedSet.has(item)
  );

  const seen = new Set<string>(orderedStandard.map(normalizeForLookup));
  const orderedCustom: string[] = [];

  for (const custom of customDocuments) {
    if (!custom.checked) continue;
    const clean = custom.label.trim();
    if (!clean) continue;
    const key = normalizeForLookup(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    orderedCustom.push(clean);
  }

  return [...orderedStandard, ...orderedCustom];
}

export function splitTermDocumentsIntoStandardAndCustom(
  documents: readonly string[]
): {
  standardSelected: string[];
  customDocuments: CustomDiscountTermDocument[];
} {
  const canonicalByNormalized = new Map<string, string>();
  for (const opt of DISCOUNT_TERM_DOCUMENT_OPTIONS) {
    canonicalByNormalized.set(normalizeForLookup(opt), opt);
  }

  const standardSet = new Set<string>();
  const customDocuments: CustomDiscountTermDocument[] = [];
  const seenCustom = new Set<string>();

  documents.forEach((rawDoc, idx) => {
    const clean = rawDoc.trim();
    if (!clean) return;
    const normalized = normalizeForLookup(clean);
    const canonicalStandard = canonicalByNormalized.get(normalized);
    if (canonicalStandard) {
      standardSet.add(canonicalStandard);
    } else if (!seenCustom.has(normalized)) {
      seenCustom.add(normalized);
      customDocuments.push({
        id: `restored-custom-${idx}-${Date.now()}`,
        label: clean,
        checked: true,
      });
    }
  });

  const standardSelected = DISCOUNT_TERM_DOCUMENT_OPTIONS.filter((opt) =>
    standardSet.has(opt)
  );

  return { standardSelected, customDocuments };
}

export function formatSelectedDocumentsCountLabel(count: number): string {
  if (count === 1) return '1 documento selecionado';
  return `${count} documentos selecionados`;
}
