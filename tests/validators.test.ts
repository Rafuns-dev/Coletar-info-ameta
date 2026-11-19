import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTRATION_FIELD_LABELS, ROLE_OPTIONS } from '../src/shared/formConfig.ts';
import { contractorRegistrationSchema } from '../src/shared/schema.ts';
import {
  formatCNPJ,
  formatCPF,
  isValidCNPJ,
  isValidCPF,
  maskCPFForList,
  maskRGForList,
} from '../src/shared/validators.ts';

function generateCPF(base9: string): string {
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

function generateCNPJ(base12: string): string {
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

test('formulário possui exatamente 16 campos configurados na ordem correta e 3 funções fixas', () => {
  assert.equal(REGISTRATION_FIELD_LABELS.length, 16);
  assert.equal(REGISTRATION_FIELD_LABELS[0].label, 'Data da Cadastro');
  assert.equal(REGISTRATION_FIELD_LABELS[8].label, 'DATA DE NASCIMENTO');
  assert.equal(REGISTRATION_FIELD_LABELS[15].label, 'Informe o seu Telefone com DDD');
  assert.deepEqual([...ROLE_OPTIONS], [
    'Analista de documentação',
    'Técnico de Instalação',
    'Técnico de Vistoria',
  ]);
});

test('validação de CPF aceita CPFs válidos e rejeita inválidos ou sequências repetidas', () => {
  const validCpf = generateCPF('390533447');
  assert.equal(isValidCPF(validCpf), true);
  assert.equal(isValidCPF('111.111.111-11'), false);
  assert.equal(isValidCPF('000.000.000-00'), false);
  assert.equal(isValidCPF('123.456.789-00'), false);
  assert.equal(isValidCPF('12345'), false);
});

test('validação de CNPJ aceita CNPJs válidos e rejeita inválidos ou sequências repetidas', () => {
  const validCnpj = generateCNPJ('418923100001');
  assert.equal(isValidCNPJ(validCnpj), true);
  assert.equal(isValidCNPJ('00.000.000/0000-00'), false);
  assert.equal(isValidCNPJ('11.111.111/1111-11'), false);
  assert.equal(isValidCNPJ('12.345.678/0001-00'), false);
});

test('mascaramento LGPD oculta dígitos sensíveis de CPF e RG', () => {
  assert.equal(maskCPFForList('123.456.789-01'), '***.456.789-**');
  const maskedRg = maskRGForList('43.812.904-5');
  assert.equal(maskedRg.startsWith('****'), true);
  assert.equal(maskedRg.endsWith('04-5'), true);
});

test('schema Zod valida todos os 16 campos obrigatórios corretamente', () => {
  const validPayload = {
    registrationDate: '2026-11-18',
    role: 'Analista de documentação',
    fullName: 'Ana Paula Ferreira',
    cpf: generateCPF('529982247'),
    rg: '42.103.551-8',
    birthPlace: 'São Paulo - SP',
    nationality: 'Brasileira',
    maritalStatus: 'Solteiro(a)',
    birthDate: '1993-06-15',
    cnpj: generateCNPJ('375410920001'),
    companyAddress: 'Av. Brigadeiro Faria Lima, 2000, São Paulo - SP',
    companyCep: '01451-001',
    fatherName: 'Marcos Antônio Ferreira',
    motherName: 'Lúcia Helena Ferreira',
    email: 'ana.ferreira@empresa.com.br',
    phone: '(11) 98877-6655',
  };

  const okResult = contractorRegistrationSchema.safeParse(validPayload);
  assert.equal(okResult.success, true);

  const badResult = contractorRegistrationSchema.safeParse({
    ...validPayload,
    cpf: '111.111.111-11',
    cnpj: '00.000.000/0000-00',
    email: 'email-invalido',
  });
  assert.equal(badResult.success, false);
});
