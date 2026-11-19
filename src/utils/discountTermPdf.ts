import { jsPDF } from 'jspdf';
import { DISCOUNT_TERM_DOCUMENT_OPTIONS } from '../shared/discountTermDocuments.ts';
import type { DiscountTermTemplateFields } from '../shared/schema.ts';

function normalizePdfText(value: string): string {
  return value.replace(/\u2011/g, '-');
}

function drawCheckbox(doc: jsPDF, x: number, yTop: number, checked: boolean): void {
  const size = 3.1;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.32);
  doc.rect(x, yTop, size, size);
  if (checked) {
    doc.line(x + 0.45, yTop + 0.45, x + size - 0.45, yTop + size - 0.45);
    doc.line(x + size - 0.45, yTop + 0.45, x + 0.45, yTop + size - 0.45);
  }
}

export function buildDiscountTermPdfDocument(
  fields: DiscountTermTemplateFields,
  selectedDocuments?: readonly string[]
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 20;
  const lineHeight = 5.1;

  let y = 20;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      y = 20;
    }
  };

  const writeParagraph = (
    text: string,
    options: {
      fontSize?: number;
      style?: 'bolditalic' | 'bold' | 'italic' | 'normal';
      spaceAfter?: number;
      indent?: number;
    } = {}
  ) => {
    const fontSize = options.fontSize ?? 10.5;
    const style = options.style ?? 'bolditalic';
    const spaceAfter = options.spaceAfter ?? 3.2;
    const indent = options.indent ?? 0;

    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    doc.setTextColor(15, 23, 42);

    const lines = doc.splitTextToSize(normalizePdfText(text), contentWidth - indent) as string[];
    const needed = lines.length * lineHeight;
    ensureSpace(needed);

    doc.text(lines, margin + indent, y);
    y += needed + spaceAfter;
  };

  const writeDivider = () => {
    ensureSpace(6);
    y += 1.5;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4.8;
  };

  const writeBullet = (text: string, level: 0 | 1 = 0, spaceAfter = 2.0) => {
    const bulletX = margin + (level === 0 ? 6 : 14);
    const textX = bulletX + 4.5;
    const maxW = pageWidth - margin - textX;

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);

    const lines = doc.splitTextToSize(normalizePdfText(text), maxW) as string[];
    ensureSpace(lines.length * lineHeight);

    if (level === 0) {
      doc.setFillColor(15, 23, 42);
      doc.circle(bulletX + 1, y - 1.1, 0.75, 'F');
    } else {
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.28);
      doc.circle(bulletX + 1, y - 1.1, 0.75, 'S');
    }

    doc.text(lines, textX, y);
    y += lines.length * lineHeight + spaceAfter;
  };

  const writeCheckboxBullet = (checked: boolean, text: string, spaceAfter = 2.2) => {
    const bulletX = margin + 14;
    const boxX = bulletX + 4.2;
    const textX = boxX + 4.8;
    const maxW = pageWidth - margin - textX;

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);

    const lines = doc.splitTextToSize(normalizePdfText(text), maxW) as string[];
    ensureSpace(lines.length * lineHeight);

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.28);
    doc.circle(bulletX + 1, y - 1.1, 0.75, 'S');
    drawCheckbox(doc, boxX, y - 3.0, checked);

    doc.text(lines, textX, y);
    y += lines.length * lineHeight + spaceAfter;
  };

  const writeNumbered = (num: number, text: string, spaceAfter = 2.2) => {
    const numX = margin + 6;
    const textX = numX + 5.5;
    const maxW = pageWidth - margin - textX;

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);

    const lines = doc.splitTextToSize(normalizePdfText(text), maxW) as string[];
    ensureSpace(lines.length * lineHeight);

    doc.text(`${num}.`, numX, y);
    doc.text(lines, textX, y);
    y += lines.length * lineHeight + spaceAfter;
  };

  // Cabeçalho
  writeParagraph(
    'TERMO DE AUTORIZAÇÃO DE DESCONTO / ABATIMENTO EM NOTA FISCAL – PESSOA JURÍDICA (PJ)',
    { fontSize: 11, spaceAfter: 4.5 }
  );

  writeParagraph('Pelo presente instrumento particular, de um lado,', { spaceAfter: 4.5 });

  writeParagraph('CONTRATANTE: AMETA PRESTAÇÃO DE SERVIÇOS LTDA,', { spaceAfter: 1.2 });
  writeParagraph(
    'pessoa jurídica de direito privado, inscrita no CNPJ nº 12.010.191/0001-14,',
    { spaceAfter: 1.2 }
  );
  writeParagraph(
    'com sede à Rua Padre Benedito de Camargo, nº 356, Conjunto 44 – Penha de França, São Paulo – SP,',
    { spaceAfter: 4.5 }
  );

  writeParagraph('e, de outro lado,', { spaceAfter: 4.5 });

  writeParagraph(
    `CONTRATADA (PESSOA JURÍDICA): ${fields.CONTRATADA_RAZAO_SOCIAL},`,
    { spaceAfter: 1.2 }
  );
  writeParagraph(`inscrita no CNPJ nº ${fields.CONTRATADA_CNPJ},`, { spaceAfter: 1.2 });
  writeParagraph(`com sede à ${fields.CONTRATADA_ENDERECO},`, { spaceAfter: 4.0 });

  writeParagraph('têm entre si justo e acordado o que segue:', { spaceAfter: 2.0 });
  writeDivider();

  // CLÁUSULA PRIMEIRA
  ensureSpace(24);
  writeParagraph('CLÁUSULA PRIMEIRA – DO OBJETO', { spaceAfter: 3.5 });
  writeParagraph(
    'O presente termo tem por objeto a autorização expressa para que a CONTRATANTE realize o desconto ou abatimento de valores diretamente nas notas fiscais emitidas pela CONTRATADA, referentes aos custos de elaboração, emissão, atualização, manutenção, reemissão e gestão de documentos de Segurança e Saúde do Trabalho, exigidos por lei, contrato ou normas internas, incluindo, mas não se limitando a:',
    { spaceAfter: 3.2 }
  );

  const documentsToRender =
    selectedDocuments && selectedDocuments.length > 0
      ? selectedDocuments
      : DISCOUNT_TERM_DOCUMENT_OPTIONS;

  documentsToRender.forEach((docLabel, idx) => {
    const isLast = idx === documentsToRender.length - 1;
    writeBullet(docLabel, 0, isLast ? 1.5 : 2.0);
  });
  writeDivider();

  // CLÁUSULA SEGUNDA
  ensureSpace(28);
  writeParagraph('CLÁUSULA SEGUNDA – DO VALOR E DA FORMA DE DESCONTO', { spaceAfter: 3.5 });
  writeParagraph(`A CONTRATADA autoriza que o valor total de R$ ${fields.VALOR_TOTAL}`, {
    spaceAfter: 1.2,
  });
  writeParagraph(`(${fields.VALOR_EXTENSO}),`, { spaceAfter: 3.2 });
  writeParagraph('seja descontado da seguinte forma:', { spaceAfter: 2.8 });

  writeBullet('O desconto será realizado diretamente nas notas fiscais emitidas pela CONTRATADA;');
  writeBullet('O abatimento poderá ocorrer:');
  writeCheckboxBullet(
    fields.MARCA_INTEGRAL === '☒',
    'Integralmente, em uma única nota fiscal; ou'
  );
  writeCheckboxBullet(
    fields.MARCA_PARCELADO === '☒',
    `De forma parcelada, em ${fields.NUM_PARCELAS} (${fields.NUM_PARCELAS_EXTENSO}) notas fiscais, no valor de R$ ${fields.VALOR_PARCELA} cada;`
  );
  writeBullet(
    `O abatimento terá início a partir da nota fiscal emitida no mês/ano ${fields.MES_ANO_INICIO}.`,
    0,
    3.0
  );

  writeParagraph(
    'O valor líquido da nota fiscal considerará o desconto previamente autorizado, devendo ser controlado e registrado entre as partes para fins contábeis e fiscais.',
    { spaceAfter: 2.0 }
  );
  writeDivider();

  // CLÁUSULA TERCEIRA
  ensureSpace(24);
  writeParagraph('CLÁUSULA TERCEIRA – DA NATUREZA JURÍDICA DA RELAÇÃO', { spaceAfter: 3.5 });
  writeParagraph('As partes declaram expressamente que:', { spaceAfter: 2.8 });
  writeNumbered(1, 'A presente relação é exclusivamente comercial, firmada entre pessoas jurídicas (PJ);');
  writeNumbered(
    2,
    'Não existe vínculo empregatício, societário, previdenciário ou trabalhista entre as partes;'
  );
  writeNumbered(
    3,
    'O desconto autorizado não possui natureza salarial, indenizatória ou remuneratória;'
  );
  writeNumbered(
    4,
    'A CONTRATADA é integralmente responsável por suas obrigações fiscais, tributárias, trabalhistas e previdenciárias, inclusive pela emissão correta das notas fiscais.',
    1.5
  );
  writeDivider();

  // CLÁUSULA QUARTA
  ensureSpace(24);
  writeParagraph('CLÁUSULA QUARTA – DA CIÊNCIA E CONSENTIMENTO', { spaceAfter: 3.5 });
  writeParagraph('A CONTRATADA declara que:', { spaceAfter: 2.8 });
  writeBullet('Tem pleno conhecimento dos documentos e serviços descritos neste termo;');
  writeBullet('Concorda expressamente com o desconto/abatimento nas notas fiscais;');
  writeBullet(
    'Autoriza o abatimento de forma livre, consciente, expressa e irrevogável, enquanto houver valores pendentes relacionados ao objeto deste instrumento.',
    0,
    1.5
  );
  writeDivider();

  // CLÁUSULA QUINTA
  ensureSpace(24);
  writeParagraph('CLÁUSULA QUINTA – DA REVOGAÇÃO', { spaceAfter: 3.5 });
  writeParagraph(
    'A presente autorização somente poderá ser revogada mediante anuência expressa da CONTRATANTE e desde que não existam valores pendentes a serem descontados.',
    { spaceAfter: 2.8 }
  );
  writeParagraph(
    'Persistindo saldo devedor, este termo permanecerá válido até a quitação integral.',
    { spaceAfter: 2.0 }
  );
  writeDivider();

  // CLÁUSULA SEXTA
  ensureSpace(26);
  writeParagraph('CLÁUSULA SEXTA – DAS DISPOSIÇÕES GERAIS', { spaceAfter: 3.5 });
  writeParagraph('Este termo:', { spaceAfter: 2.8 });
  writeBullet('entra em vigor na data de sua assinatura;');
  writeBullet('permanecerá válido até a quitação total dos valores acordados;');
  writeBullet('poderá ser utilizado como anexo ao contrato principal de prestação de serviços;');
  writeBullet('obriga as partes e seus sucessores.', 0, 1.5);
  writeDivider();

  // Local e assinaturas
  ensureSpace(55);
  writeParagraph(`Local e data: ${fields.LOCAL_DATA}`, { spaceAfter: 2.0 });
  writeDivider();
  writeDivider();

  writeParagraph('CONTRATANTE:', { spaceAfter: 2.5 });
  writeParagraph('Razão Social: AMETA PRESTAÇÃO DE SERVIÇOS LTDA', { spaceAfter: 1.5 });
  writeParagraph('Assinatura: _______________________________________________', {
    spaceAfter: 2.0,
  });
  writeDivider();

  ensureSpace(24);
  writeParagraph('CONTRATADA (PJ):', { spaceAfter: 2.5 });
  writeParagraph(`Razão Social: ${fields.CONTRATADA_RAZAO_SOCIAL}`, { spaceAfter: 1.5 });
  writeParagraph('Assinatura: _______________________________________________', {
    spaceAfter: 2.0,
  });

  return doc;
}

export function exportDiscountTermToPdf(
  fields: DiscountTermTemplateFields,
  companyNameHint?: string,
  selectedDocuments?: readonly string[]
): void {
  const doc = buildDiscountTermPdfDocument(fields, selectedDocuments);

  const slugSource = companyNameHint || fields.CONTRATADA_RAZAO_SOCIAL || 'termo-desconto';
  const safeSlug = slugSource
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  doc.save(`termo-autorizacao-desconto-${safeSlug || 'ameta'}.pdf`);
}
