import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { DiscountTermTemplateFields } from '../shared/schema.ts';

const TEMPLATE_URL = '/templates/Modelo_Termo_Desconto_com_campos.docx';

let cachedTemplateBuffer: ArrayBuffer | null = null;

async function fetchTemplateBuffer(): Promise<ArrayBuffer> {
  if (cachedTemplateBuffer) {
    return cachedTemplateBuffer;
  }

  const response = await fetch(TEMPLATE_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Não foi possível carregar o modelo Word (.docx) do Termo de Desconto.');
  }

  const buffer = await response.arrayBuffer();
  cachedTemplateBuffer = buffer;
  return buffer;
}

export function renderDiscountTermDocxUint8Array(
  fields: DiscountTermTemplateFields,
  templateBytes: ArrayBuffer | Uint8Array
): Uint8Array {
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });

  doc.render(fields);

  return doc.getZip().generate({
    type: 'uint8array',
    compression: 'DEFLATE',
  }) as Uint8Array;
}

export async function exportDiscountTermToDocx(
  fields: DiscountTermTemplateFields,
  companyNameHint?: string
): Promise<void> {
  const templateBuffer = await fetchTemplateBuffer();
  const outputBytes = renderDiscountTermDocxUint8Array(fields, templateBuffer);
  const safeBytes = new Uint8Array(outputBytes);

  const blob = new Blob([safeBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const slugSource = companyNameHint || fields.CONTRATADA_RAZAO_SOCIAL || 'termo-desconto';
  const safeSlug = slugSource
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `termo-autorizacao-desconto-${safeSlug || 'ameta'}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
