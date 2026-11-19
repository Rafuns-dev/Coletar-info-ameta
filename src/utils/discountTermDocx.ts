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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replaceClauseOneDocumentsInXml(
  documentXml: string,
  selectedDocuments: readonly string[]
): string {
  const introAnchor = 'incluindo, mas não se limitando a:';
  const introIdx = documentXml.indexOf(introAnchor);
  if (introIdx === -1) return documentXml;

  const introParagraphEnd = documentXml.indexOf('</w:p>', introIdx);
  if (introParagraphEnd === -1) return documentXml;
  const searchStart = introParagraphEnd + '</w:p>'.length;

  const clausula2Idx = documentXml.indexOf('CLÁUSULA SEGUNDA', searchStart);
  if (clausula2Idx === -1) return documentXml;

  const sectionSlice = documentXml.slice(searchStart, clausula2Idx);
  const paragraphRegex = /<w:p>[\s\S]*?<\/w:p>/g;
  const listParagraphs: Array<{ start: number; end: number; xml: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = paragraphRegex.exec(sectionSlice)) !== null) {
    if (match[0].includes('w:val="ListParagraph"')) {
      listParagraphs.push({
        start: match.index,
        end: match.index + match[0].length,
        xml: match[0],
      });
    }
  }

  if (listParagraphs.length === 0) return documentXml;

  const bulletPrototype = listParagraphs[0].xml;
  if (!/<w:t[^>]*>[\s\S]*?<\/w:t>/.test(bulletPrototype)) {
    return documentXml;
  }

  const generatedBullets = selectedDocuments
    .map((docText) => {
      const escaped = escapeXml(docText.trim());
      return bulletPrototype.replace(
        /<w:t[^>]*>[\s\S]*?<\/w:t>/,
        () => `<w:t xml:space="preserve">${escaped}</w:t>`
      );
    })
    .join('');

  const replaceStart = searchStart + listParagraphs[0].start;
  const replaceEnd = searchStart + listParagraphs[listParagraphs.length - 1].end;

  return `${documentXml.slice(0, replaceStart)}${generatedBullets}${documentXml.slice(replaceEnd)}`;
}

export function renderDiscountTermDocxUint8Array(
  fields: DiscountTermTemplateFields,
  templateBytes: ArrayBuffer | Uint8Array,
  selectedDocuments?: readonly string[]
): Uint8Array {
  const zip = new PizZip(templateBytes);

  if (selectedDocuments && selectedDocuments.length > 0) {
    const docXmlFile = zip.file('word/document.xml');
    if (docXmlFile) {
      const updatedXml = replaceClauseOneDocumentsInXml(docXmlFile.asText(), selectedDocuments);
      zip.file('word/document.xml', updatedXml);
    }
  }

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
  companyNameHint?: string,
  selectedDocuments?: readonly string[]
): Promise<void> {
  const templateBuffer = await fetchTemplateBuffer();
  const outputBytes = renderDiscountTermDocxUint8Array(
    fields,
    templateBuffer,
    selectedDocuments
  );
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
