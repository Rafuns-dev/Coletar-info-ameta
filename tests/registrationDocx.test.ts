import assert from 'node:assert/strict';
import test from 'node:test';
import PizZip from 'pizzip';
import { REGISTRATION_FIELD_LABELS } from '../src/shared/formConfig.ts';
import type { ContractorRegistrationDetail } from '../src/shared/schema.ts';
import { buildRegistrationDocxUint8Array } from '../src/utils/registrationDocx.ts';

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSampleRecord(
  overrides: Partial<ContractorRegistrationDetail> = {}
): ContractorRegistrationDetail {
  return {
    id: 'reg-word-1',
    registrationDate: '2026-04-10',
    role: 'Técnico de Instalação',
    fullName: 'Carlos Eduardo Pereira & Filho <PJ>',
    cpf: '123.456.789-00',
    rg: '45.123.678-9',
    birthPlace: 'São Paulo/SP',
    nationality: 'Brasileira',
    maritalStatus: 'Casado(a)',
    birthDate: '1989-11-23',
    cnpj: '12.345.678/0001-99',
    companyAddress: 'Rua das Flores, 450 - Centro - São Paulo/SP',
    companyCep: '01001-000',
    fatherName: 'José Pereira',
    motherName: 'Maria Pereira',
    email: 'carlos@example.com',
    phone: '(11) 98765-4321',
    status: 'Em análise',
    internalNotes: 'Documentação conferida & aprovada para integração.',
    viewed: true,
    viewedAt: '2026-04-10T14:00:00.000Z',
    createdAt: '2026-04-10T12:30:00.000Z',
    updatedAt: '2026-04-10T14:00:00.000Z',
    ...overrides,
  };
}

test('buildRegistrationDocxUint8Array gera arquivo .docx válido com os 16 campos e observações internas', () => {
  const sample = makeSampleRecord();
  const bytes = buildRegistrationDocxUint8Array(sample);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 500);

  const zip = new PizZip(bytes);
  assert.ok(zip.file('[Content_Types].xml'));
  assert.ok(zip.file('_rels/.rels'));
  assert.ok(zip.file('word/_rels/document.xml.rels'));
  assert.ok(zip.file('word/styles.xml'));

  const documentXmlFile = zip.file('word/document.xml');
  assert.ok(documentXmlFile);
  const rawXml = documentXmlFile.asText();
  const text = stripXmlTags(rawXml);

  assert.match(text, /AMETA SERVIÇOS/);
  assert.match(text, /Ficha Cadastral de Prestador PJ/);
  assert.match(text, /Status: Em análise/);
  assert.match(text, /10\/04\/2026/);
  assert.match(text, /23\/11\/1989/);
  assert.match(text, /Carlos Eduardo Pereira & Filho <PJ>/);
  assert.match(text, /Rua das Flores, 450 - Centro - São Paulo\/SP/);
  assert.match(text, /Observações internas/);
  assert.match(text, /Documentação conferida & aprovada para integração\./);

  REGISTRATION_FIELD_LABELS.forEach((field, index) => {
    assert.ok(
      text.includes(`${index + 1}. ${field.label}`),
      `Expected label ${index + 1}. ${field.label} in generated docx`
    );
  });
});

test('buildRegistrationDocxUint8Array omite seção de observações internas quando vazia', () => {
  const sample = makeSampleRecord({ internalNotes: '' });
  const bytes = buildRegistrationDocxUint8Array(sample);
  const zip = new PizZip(bytes);
  const text = stripXmlTags(zip.file('word/document.xml')!.asText());

  assert.doesNotMatch(text, /Observações internas/);
});
