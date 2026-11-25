import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_REGISTRATION_DOCUMENT_BYTES,
  registrationDocumentAttachmentSchema,
} from '../src/shared/schema.ts';
import {
  base64ToUint8Array,
  buildAttachmentDataUrl,
  formatBytesLabel,
  REGISTRATION_DOCUMENT_SLOTS,
  sanitizeAttachmentFileName,
  uint8ArrayToBase64,
} from '../src/utils/documentUpload.ts';

test('REGISTRATION_DOCUMENT_SLOTS define exatamente RG, CNH e Certificado MEI', () => {
  assert.deepEqual(
    REGISTRATION_DOCUMENT_SLOTS.map((slot) => slot.type),
    ['rg', 'cnh', 'certificado_mei']
  );
  assert.deepEqual(
    REGISTRATION_DOCUMENT_SLOTS.map((slot) => slot.title),
    ['RG', 'CNH', 'Certificado MEI']
  );
});

test('uint8ArrayToBase64 e base64ToUint8Array preservam os bytes exatamente', () => {
  const original = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 255, 0, 128]);
  const encoded = uint8ArrayToBase64(original);
  const decoded = base64ToUint8Array(encoded);
  assert.deepEqual(decoded, original);
});

test('sanitizeAttachmentFileName limpa caracteres inválidos e limita tamanho', () => {
  assert.equal(sanitizeAttachmentFileName('rg/frente:2026?.pdf'), 'rg_frente_2026_.pdf');
  const longName = `${'a'.repeat(220)}.pdf`;
  const sanitized = sanitizeAttachmentFileName(longName);
  assert.ok(sanitized.length <= 180);
  assert.ok(sanitized.endsWith('.pdf'));
});

test('formatBytesLabel formata B, KB e MB de forma legível', () => {
  assert.equal(formatBytesLabel(512), '512 B');
  assert.equal(formatBytesLabel(12_400), '12 KB');
  assert.equal(formatBytesLabel(1_572_864), '1,50 MB');
});

test('registrationDocumentAttachmentSchema valida anexos corretos e rejeita tipo/MIME/tamanho inválidos', () => {
  const valid = registrationDocumentAttachmentSchema.safeParse({
    tipo: 'certificado_mei',
    nomeArquivo: 'ccmei-empresa.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: 1024,
    conteudoBase64: 'JVBERi0xLjQK',
  });
  assert.equal(valid.success, true);

  const dataUrl = buildAttachmentDataUrl(valid.data);
  assert.equal(dataUrl, 'data:application/pdf;base64,JVBERi0xLjQK');

  const invalidType = registrationDocumentAttachmentSchema.safeParse({
    tipo: 'passaporte',
    nomeArquivo: 'doc.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: 1024,
    conteudoBase64: 'JVBERi0xLjQK',
  });
  assert.equal(invalidType.success, false);

  const invalidMime = registrationDocumentAttachmentSchema.safeParse({
    tipo: 'rg',
    nomeArquivo: 'script.html',
    mimeType: 'text/html',
    tamanhoBytes: 1024,
    conteudoBase64: 'PGh0bWw+',
  });
  assert.equal(invalidMime.success, false);

  const oversized = registrationDocumentAttachmentSchema.safeParse({
    tipo: 'cnh',
    nomeArquivo: 'cnh.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: MAX_REGISTRATION_DOCUMENT_BYTES + 1,
    conteudoBase64: 'JVBERi0xLjQK',
  });
  assert.equal(oversized.success, false);
});
