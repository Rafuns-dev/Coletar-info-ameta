import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import PizZip from 'pizzip';
import {
  formatCurrencyBRL,
  formatLocalDatePtBR,
  integerToFeminineWordsPt,
  numberToCurrencyWordsPt,
  parseCurrencyBRL,
} from '../src/shared/numberToWordsPt.ts';
import type { DiscountTermTemplateFields } from '../src/shared/schema.ts';
import { renderDiscountTermDocxUint8Array } from '../src/utils/discountTermDocx.ts';

const templatePath = path.resolve(
  process.cwd(),
  'public/templates/Modelo_Termo_Desconto_com_campos.docx'
);

test('conversão de moeda e inteiros para extenso em português brasileiro', () => {
  assert.equal(numberToCurrencyWordsPt(0), 'zero reais');
  assert.equal(numberToCurrencyWordsPt(1), 'um real');
  assert.equal(numberToCurrencyWordsPt(1.01), 'um real e um centavo');
  assert.equal(numberToCurrencyWordsPt(350), 'trezentos e cinquenta reais');
  assert.equal(
    numberToCurrencyWordsPt(1250.45),
    'mil duzentos e cinquenta reais e quarenta e cinco centavos'
  );
  assert.equal(numberToCurrencyWordsPt(2000), 'dois mil reais');

  assert.equal(integerToFeminineWordsPt(1), 'uma');
  assert.equal(integerToFeminineWordsPt(2), 'duas');
  assert.equal(integerToFeminineWordsPt(12), 'doze');
  assert.equal(integerToFeminineWordsPt(22), 'vinte e duas');

  assert.equal(parseCurrencyBRL('1.250,45'), 1250.45);
  assert.equal(formatCurrencyBRL(1250.45), '1.250,45');
  assert.equal(formatLocalDatePtBR(new Date(2026, 10, 18)), 'São Paulo, 18 de novembro de 2026');
});

test('renderDiscountTermDocxUint8Array substitui todos os marcadores preservando cláusulas e Ameta fixa (integral)', () => {
  const templateBytes = fs.readFileSync(templatePath);
  const fields: DiscountTermTemplateFields = {
    CONTRATADA_RAZAO_SOCIAL: 'ALFA INSTALAÇÕES ELÉTRICAS LTDA',
    CONTRATADA_CNPJ: '12.345.678/0001-95',
    CONTRATADA_ENDERECO: 'Av. Paulista, 1000, São Paulo - SP - CEP: 01310-100',
    VALOR_TOTAL: '1.500,00',
    VALOR_EXTENSO: 'mil e quinhentos reais',
    MARCA_INTEGRAL: '☒',
    MARCA_PARCELADO: '☐',
    NUM_PARCELAS: '—',
    NUM_PARCELAS_EXTENSO: '—',
    VALOR_PARCELA: '—',
    MES_ANO_INICIO: '12/2026',
    LOCAL_DATA: 'São Paulo, 18 de novembro de 2026',
  };

  const docxBytes = renderDiscountTermDocxUint8Array(fields, templateBytes);
  assert.ok(docxBytes instanceof Uint8Array && docxBytes.length > 1000);

  const zip = new PizZip(docxBytes);
  const documentXml = zip.file('word/document.xml')?.asText() ?? '';

  assert.equal(documentXml.includes('{{'), false);
  assert.equal(documentXml.includes('}}'), false);
  assert.equal(documentXml.includes('AMETA PRESTAÇÃO DE SERVIÇOS LTDA'), true);
  assert.equal(documentXml.includes('12.010.191/0001-14'), true);
  assert.equal(documentXml.includes('CLÁUSULA PRIMEIRA'), true);
  assert.equal(documentXml.includes('CLÁUSULA SEXTA'), true);
  assert.equal(documentXml.includes('ALFA INSTALAÇÕES ELÉTRICAS LTDA'), true);
  assert.equal(documentXml.includes('12.345.678/0001-95'), true);
  assert.equal(documentXml.includes('1.500,00'), true);
  assert.equal(documentXml.includes('mil e quinhentos reais'), true);
  assert.equal(documentXml.includes('☒'), true);
  assert.equal(documentXml.includes('☐'), true);
  assert.equal(documentXml.includes('12/2026'), true);
});

test('renderDiscountTermDocxUint8Array substitui marcadores no modo parcelado no navegador', () => {
  const templateBytes = fs.readFileSync(templatePath);
  const fields: DiscountTermTemplateFields = {
    CONTRATADA_RAZAO_SOCIAL: 'BETA VISTORIAS ME',
    CONTRATADA_CNPJ: '98.765.432/0001-10',
    CONTRATADA_ENDERECO: 'Rua das Flores, 50 - CEP: 04567-000',
    VALOR_TOTAL: '900,00',
    VALOR_EXTENSO: 'novecentos reais',
    MARCA_INTEGRAL: '☐',
    MARCA_PARCELADO: '☒',
    NUM_PARCELAS: '3',
    NUM_PARCELAS_EXTENSO: 'três',
    VALOR_PARCELA: '300,00',
    MES_ANO_INICIO: '01/2027',
    LOCAL_DATA: 'São Paulo, 18 de novembro de 2026',
  };

  const docxBytes = renderDiscountTermDocxUint8Array(fields, templateBytes);
  const zip = new PizZip(docxBytes);
  const documentXml = zip.file('word/document.xml')?.asText() ?? '';
  const plainText = documentXml.replace(/<[^>]+>/g, '');

  assert.equal(documentXml.includes('{{'), false);
  assert.equal(documentXml.includes('}}'), false);
  assert.equal(
    plainText.includes('☒ De forma parcelada, em 3 (três) notas fiscais, no valor de R$ 300,00 cada;'),
    true
  );
});

test('lista padrão possui exatamente 12 documentos na ordem e ordenação coloca itens adicionados no final', async () => {
  const {
    DISCOUNT_TERM_DOCUMENT_OPTIONS,
    orderDiscountTermDocuments,
    splitTermDocumentsIntoStandardAndCustom,
  } = await import('../src/shared/discountTermDocuments.ts');

  assert.equal(DISCOUNT_TERM_DOCUMENT_OPTIONS.length, 12);
  assert.equal(
    DISCOUNT_TERM_DOCUMENT_OPTIONS[0],
    'NR‑06 – Equipamento de Proteção Individual (EPI)'
  );
  assert.equal(
    DISCOUNT_TERM_DOCUMENT_OPTIONS[11],
    'Demais Normas Regulamentadoras (NRs), documentos técnicos, formulários e registros exigidos pelos órgãos fiscalizadores ou contratantes.'
  );

  // Selecionados fora de ordem + item customizado -> mantém ordem 1..12 e customizado no final
  const ordered = orderDiscountTermDocuments(
    [DISCOUNT_TERM_DOCUMENT_OPTIONS[8], DISCOUNT_TERM_DOCUMENT_OPTIONS[0]],
    [
      { id: 'c1', label: 'ASO Periódico Adicional', checked: true },
      { id: 'c2', label: 'Item Desmarcado', checked: false },
    ]
  );

  assert.deepEqual(ordered, [
    'NR‑06 – Equipamento de Proteção Individual (EPI)',
    'NR‑35 – Trabalho em Altura',
    'ASO Periódico Adicional',
  ]);

  const restored = splitTermDocumentsIntoStandardAndCustom(ordered);
  assert.deepEqual(restored.standardSelected, [
    'NR‑06 – Equipamento de Proteção Individual (EPI)',
    'NR‑35 – Trabalho em Altura',
  ]);
  assert.equal(restored.customDocuments.length, 1);
  assert.equal(restored.customDocuments[0].label, 'ASO Periódico Adicional');
  assert.equal(restored.customDocuments[0].checked, true);
});

test('Word (.docx) e PDF com 2 documentos marcados incluem APENAS os 2 na Cláusula Primeira e mantêm abertura intacta', async () => {
  const { DISCOUNT_TERM_DOCUMENT_OPTIONS } = await import('../src/shared/discountTermDocuments.ts');
  const { buildDiscountTermPdfDocument } = await import('../src/utils/discountTermPdf.ts');

  const templateBytes = fs.readFileSync(templatePath);
  const fields: DiscountTermTemplateFields = {
    CONTRATADA_RAZAO_SOCIAL: 'GAMA TELECOM LTDA',
    CONTRATADA_CNPJ: '11.222.333/0001-81',
    CONTRATADA_ENDERECO: 'Av. Brasil, 200 - CEP: 01430-000',
    VALOR_TOTAL: '600,00',
    VALOR_EXTENSO: 'seiscentos reais',
    MARCA_INTEGRAL: '☒',
    MARCA_PARCELADO: '☐',
    NUM_PARCELAS: '—',
    NUM_PARCELAS_EXTENSO: '—',
    VALOR_PARCELA: '—',
    MES_ANO_INICIO: '12/2026',
    LOCAL_DATA: 'São Paulo, 18 de novembro de 2026',
  };

  const selectedTwo = [
    DISCOUNT_TERM_DOCUMENT_OPTIONS[0],
    DISCOUNT_TERM_DOCUMENT_OPTIONS[4],
  ];

  const docxBytes = renderDiscountTermDocxUint8Array(fields, templateBytes, selectedTwo);
  const zip = new PizZip(docxBytes);
  const documentXml = zip.file('word/document.xml')?.asText() ?? '';
  const plainText = documentXml.replace(/<[^>]+>/g, '');

  // Abertura da Cláusula Primeira mantida intacta
  assert.equal(plainText.includes('incluindo, mas não se limitando a:'), true);
  // Os 2 marcados aparecem
  assert.equal(plainText.includes(DISCOUNT_TERM_DOCUMENT_OPTIONS[0]), true);
  assert.equal(plainText.includes(DISCOUNT_TERM_DOCUMENT_OPTIONS[4]), true);
  // Os demais não marcados NÃO aparecem
  assert.equal(plainText.includes(DISCOUNT_TERM_DOCUMENT_OPTIONS[1]), false);
  assert.equal(plainText.includes(DISCOUNT_TERM_DOCUMENT_OPTIONS[7]), false);
  assert.equal(plainText.includes(DISCOUNT_TERM_DOCUMENT_OPTIONS[11]), false);
  // Cláusulas seguintes continuam íntegras
  assert.equal(plainText.includes('CLÁUSULA SEGUNDA'), true);
  assert.equal(plainText.includes('CLÁUSULA SEXTA'), true);

  // Teste com apenas 1 documento (bullet único)
  const docxOne = renderDiscountTermDocxUint8Array(fields, templateBytes, ['Documento Único & Especial']);
  const plainOne = (new PizZip(docxOne).file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
  assert.equal(plainOne.includes('Documento Único &amp; Especial') || plainOne.includes('Documento Único & Especial'), true);
  assert.equal(plainOne.includes('Ficha de Entrega e Controle de EPI'), false);

  // Teste do PDF com os 2 documentos
  const pdfDoc = buildDiscountTermPdfDocument(fields, selectedTwo);
  const pdfRaw = pdfDoc.output();
  assert.equal(pdfRaw.includes('incluindo, mas'), true);
  assert.equal(pdfRaw.includes('NR-06'), true);
  assert.equal(pdfRaw.includes('PGR'), true);
  assert.equal(pdfRaw.includes('NR-07'), false);
  assert.equal(pdfRaw.includes('NR-10'), false);
  assert.equal(pdfRaw.includes('Ficha de Entrega e Controle de EPI'), false);
});

test('discountTermGenerateSchema bloqueia geração quando 0 documentos são selecionados', async () => {
  const { discountTermGenerateSchema } = await import('../src/shared/schema.ts');

  const result = discountTermGenerateSchema.safeParse({
    paymentMode: 'integral',
    totalValueDisplay: '500,00',
    totalValueWords: 'quinhentos reais',
    installmentsCount: '',
    installmentsWords: '',
    installmentValueDisplay: '',
    startMonthYear: '12/2026',
    localDate: 'São Paulo, 18 de novembro de 2026',
    contractorCompanyName: 'EMPRESA TESTE LTDA',
    contractorCnpj: '12.345.678/0001-95',
    contractorAddress: 'Rua A, 10 - CEP: 01000-000',
    selectedDocuments: [],
    templateFields: {
      CONTRATADA_RAZAO_SOCIAL: 'EMPRESA TESTE LTDA',
      CONTRATADA_CNPJ: '12.345.678/0001-95',
      CONTRATADA_ENDERECO: 'Rua A, 10 - CEP: 01000-000',
      VALOR_TOTAL: '500,00',
      VALOR_EXTENSO: 'quinhentos reais',
      MARCA_INTEGRAL: '☒',
      MARCA_PARCELADO: '☐',
      NUM_PARCELAS: '—',
      NUM_PARCELAS_EXTENSO: '—',
      VALOR_PARCELA: '—',
      MES_ANO_INICIO: '12/2026',
      LOCAL_DATA: 'São Paulo, 18 de novembro de 2026',
    },
    requestedFormat: 'pdf',
  });

  assert.equal(result.success, false);
});
