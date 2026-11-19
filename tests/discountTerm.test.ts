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
