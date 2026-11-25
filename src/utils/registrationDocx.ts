import PizZip from 'pizzip';
import { REGISTRATION_FIELD_LABELS } from '../shared/formConfig.ts';
import type { ContractorRegistrationDetail } from '../shared/schema.ts';
import { formatDateBR, formatDateTimeBR } from '../shared/validators.ts';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:color w:val="1B2340"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

function buildTableRowXml(label: string, value: string, isAltRow: boolean): string {
  const valueLines = (value || '-').split(/\r?\n/);
  const valueParagraphs = valueLines
    .map(
      (line) => `<w:p>
        <w:pPr><w:spacing w:before="20" w:after="20" w:line="260"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
            <w:sz w:val="21"/>
            <w:szCs w:val="21"/>
            <w:color w:val="1B2340"/>
          </w:rPr>
          <w:t xml:space="preserve">${escapeXml(line)}</w:t>
        </w:r>
      </w:p>`
    )
    .join('');

  const labelFill = isAltRow ? 'F1F5FB' : 'F8FAFD';
  const valueFill = isAltRow ? 'FAFBFD' : 'FFFFFF';

  return `<w:tr>
    <w:trPr><w:cantSplit/></w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="3600" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="${labelFill}"/>
        <w:tcMar>
          <w:top w:w="100" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:left w:w="140" w:type="dxa"/>
          <w:right w:w="140" w:type="dxa"/>
        </w:tcMar>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="20" w:after="20" w:line="260"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
            <w:b/>
            <w:sz w:val="19"/>
            <w:szCs w:val="19"/>
            <w:color w:val="475569"/>
          </w:rPr>
          <w:t xml:space="preserve">${escapeXml(label)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="6038" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="${valueFill}"/>
        <w:tcMar>
          <w:top w:w="100" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:left w:w="160" w:type="dxa"/>
          <w:right w:w="140" w:type="dxa"/>
        </w:tcMar>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      ${valueParagraphs}
    </w:tc>
  </w:tr>`;
}

export function buildRegistrationDocxUint8Array(record: ContractorRegistrationDetail): Uint8Array {
  const rowsXml = REGISTRATION_FIELD_LABELS.map((field, index) => {
    const rawValue = record[field.key];
    const displayValue =
      field.key === 'registrationDate' || field.key === 'birthDate'
        ? formatDateBR(rawValue)
        : rawValue;
    return buildTableRowXml(`${index + 1}. ${field.label}`, displayValue || '-', index % 2 === 1);
  }).join('');

  const notesBlock =
    record.internalNotes && record.internalNotes.trim().length > 0
      ? `<w:p>
          <w:pPr><w:spacing w:before="220" w:after="60"/></w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
              <w:b/>
              <w:sz w:val="21"/>
              <w:szCs w:val="21"/>
              <w:color w:val="1F2E85"/>
            </w:rPr>
            <w:t xml:space="preserve">Observações internas</w:t>
          </w:r>
        </w:p>
        ${record.internalNotes
          .trim()
          .split(/\r?\n/)
          .map(
            (line) => `<w:p>
              <w:pPr><w:spacing w:before="20" w:after="40" w:line="264"/></w:pPr>
              <w:r>
                <w:rPr>
                  <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
                  <w:sz w:val="20"/>
                  <w:szCs w:val="20"/>
                  <w:color w:val="334155"/>
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(line)}</w:t>
              </w:r>
            </w:p>`
          )
          .join('')}`
      : '';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:spacing w:before="0" w:after="40"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
          <w:b/>
          <w:sz w:val="30"/>
          <w:szCs w:val="30"/>
          <w:color w:val="1F2E85"/>
        </w:rPr>
        <w:t xml:space="preserve">AMETA SERVIÇOS</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:spacing w:before="0" w:after="60"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
          <w:b/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
          <w:color w:val="229A9A"/>
        </w:rPr>
        <w:t xml:space="preserve">Ficha Cadastral de Prestador PJ (Primeiro Contato)</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:bottom w:val="single" w:sz="8" w:space="6" w:color="1F2E85"/>
        </w:pBdr>
        <w:spacing w:before="0" w:after="180"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
          <w:sz w:val="18"/>
          <w:szCs w:val="18"/>
          <w:color w:val="5E667D"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(`Status: ${record.status}   |   Enviado em: ${formatDateTimeBR(record.createdAt)}`)}</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9638" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E3E7EF"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E3E7EF"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3600"/>
        <w:gridCol w:w="6038"/>
      </w:tblGrid>
      ${rowsXml}
    </w:tbl>
    ${notesBlock}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1020" w:right="1134" w:bottom="1020" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELS_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', documentXml);

  return zip.generate({
    type: 'uint8array',
    compression: 'DEFLATE',
  }) as Uint8Array;
}

export function exportRegistrationToDocx(record: ContractorRegistrationDetail): void {
  const bytes = buildRegistrationDocxUint8Array(record);
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeSlug = record.fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `ameta-ficha-${safeSlug || record.id}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
