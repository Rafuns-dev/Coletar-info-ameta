import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractorRegistrationDetail } from '../src/shared/schema.ts';
import {
  filterAndSortRegistrations,
  normalizeSearchText,
} from '../src/shared/searchFilters.ts';
import { formatCNPJ, formatCPF } from '../src/shared/validators.ts';

function makeCPF(base9: string): string {
  const digits = base9.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 >= 10) d1 = 0;
  digits.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 >= 10) d2 = 0;
  digits.push(d2);
  return formatCPF(digits.join(''));
}

function makeCNPJ(base12: string): string {
  const digits = base12.split('').map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * w1[i];
  const r1 = sum % 11;
  digits.push(r1 < 2 ? 0 : 11 - r1);
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += digits[i] * w2[i];
  const r2 = sum % 11;
  digits.push(r2 < 2 ? 0 : 11 - r2);
  return formatCNPJ(digits.join(''));
}

const sampleRecords: ContractorRegistrationDetail[] = [
  {
    id: 'reg-a',
    registrationDate: '2026-11-10',
    role: 'Analista de documentação',
    fullName: 'Beatriz Monteiro Lima',
    cpf: makeCPF('123456789'),
    rg: '44.555.666-7',
    birthPlace: 'São Paulo - SP',
    nationality: 'Brasileira',
    maritalStatus: 'Solteiro(a)',
    birthDate: '1992-05-10',
    cnpj: makeCNPJ('123456780001'),
    companyAddress: 'Rua Augusta, 100',
    companyCep: '01305-000',
    fatherName: 'João Lima',
    motherName: 'Maria Monteiro',
    email: 'beatriz@lima.com.br',
    phone: '(11) 98765-4321',
    status: 'Dados conferidos',
    internalNotes: 'Documentos validados.',
    viewed: true,
    viewedAt: '2026-11-10T12:00:00.000Z',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
  },
  {
    id: 'reg-b',
    registrationDate: '2026-11-18',
    role: 'Técnico de Instalação',
    fullName: 'Carlos Eduardo Rocha',
    cpf: makeCPF('987654321'),
    rg: 'MG-11.222.333',
    birthPlace: 'Belo Horizonte - MG',
    nationality: 'Argentina',
    maritalStatus: 'Casado(a)',
    birthDate: '1989-08-20',
    cnpj: makeCNPJ('987654320001'),
    companyAddress: 'Av. Afonso Pena, 500',
    companyCep: '30130-001',
    fatherName: 'Pedro Rocha',
    motherName: 'Ana Rocha',
    email: 'carlos@rocha.com.br',
    phone: '(31) 99988-7766',
    status: 'Novo',
    internalNotes: '',
    viewed: false,
    viewedAt: null,
    createdAt: '2026-11-18T09:00:00.000Z',
    updatedAt: '2026-11-18T09:00:00.000Z',
  },
];

test('normalizeSearchText remove acentos e normaliza maiúsculas/minúsculas', () => {
  assert.equal(normalizeSearchText('  São Paulo - Ação  '), 'sao paulo - acao');
});

test('filtros por busca (com/sem máscara), múltiplas funções, status, naturalidade, período e não vistos', () => {
  const cpfADigits = sampleRecords[0].cpf.replace(/\D/g, '');
  const byCpfDigits = filterAndSortRegistrations(sampleRecords, { search: cpfADigits });
  assert.equal(byCpfDigits.length, 1);
  assert.equal(byCpfDigits[0].id, 'reg-a');

  const byRgClean = filterAndSortRegistrations(sampleRecords, { search: '445556667' });
  assert.equal(byRgClean.length, 1);
  assert.equal(byRgClean[0].id, 'reg-a');

  const byPhoneDigits = filterAndSortRegistrations(sampleRecords, { search: '31999887766' });
  assert.equal(byPhoneDigits.length, 1);
  assert.equal(byPhoneDigits[0].id, 'reg-b');

  const byPartialName = filterAndSortRegistrations(sampleRecords, { search: 'monteiro' });
  assert.equal(byPartialName.length, 1);
  assert.equal(byPartialName[0].id, 'reg-a');

  const multiRole = filterAndSortRegistrations(sampleRecords, {
    roles: ['Analista de documentação', 'Técnico de Instalação'],
  });
  assert.equal(multiRole.length, 2);

  const byBirthPlace = filterAndSortRegistrations(sampleRecords, { birthPlace: 'sao paulo' });
  assert.equal(byBirthPlace.length, 1);
  assert.equal(byBirthPlace[0].id, 'reg-a');

  const byNat = filterAndSortRegistrations(sampleRecords, {
    nationality: 'argentina',
    maritalStatus: 'Casado(a)',
  });
  assert.equal(byNat.length, 1);
  assert.equal(byNat[0].id, 'reg-b');

  const unseen = filterAndSortRegistrations(sampleRecords, { unseenOnly: true });
  assert.equal(unseen.length, 1);
  assert.equal(unseen[0].id, 'reg-b');

  const conferred = filterAndSortRegistrations(sampleRecords, { status: 'Dados conferidos' });
  assert.equal(conferred.length, 1);
  assert.equal(conferred[0].id, 'reg-a');

  const byPeriod = filterAndSortRegistrations(sampleRecords, {
    dateFrom: '2026-11-15',
    dateTo: '2026-11-20',
  });
  assert.equal(byPeriod.length, 1);
  assert.equal(byPeriod[0].id, 'reg-b');

  const sortedByName = filterAndSortRegistrations(sampleRecords, { sort: 'fullName:desc' });
  assert.equal(sortedByName[0].id, 'reg-b');
  assert.equal(sortedByName[1].id, 'reg-a');
});
