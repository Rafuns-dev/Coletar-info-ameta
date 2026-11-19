import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REGISTRATION_FIELD_LABELS } from '../src/shared/formConfig.ts';
import { contractorRegistrationSchema } from '../src/shared/schema.ts';

test('formulário público mantém exatamente os 16 campos obrigatórios na ordem correta', () => {
  assert.equal(REGISTRATION_FIELD_LABELS.length, 16);
  assert.equal(REGISTRATION_FIELD_LABELS[0].label, 'Data da Cadastro');
  assert.equal(REGISTRATION_FIELD_LABELS[1].label, 'Qual será a sua função na empresa');
  assert.equal(REGISTRATION_FIELD_LABELS[8].label, 'DATA DE NASCIMENTO');
  assert.equal(REGISTRATION_FIELD_LABELS[15].label, 'Informe o seu Telefone com DDD');
});

test('firestore.rules bloqueia leitura pública de cadastros, valida os 16 campos e separa RBAC admin/operador', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  // Visitante não autenticado só pode criar em /cadastros; leitura/atualização exige usuário ativo do painel; exclusão só administrador
  assert.match(rulesText, /match \/cadastros\/\{cadastroId\}/);
  assert.match(rulesText, /allow get, list:\s*if equipe\(\);/);
  assert.match(rulesText, /allow create:\s*if isValidId\(cadastroId\)\s*&& isValidCadastro\(incoming\(\)\)/);
  assert.match(rulesText, /allow update:\s*if equipe\(\)/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(\[\s*'status',\s*'observacoes',\s*'visto',\s*'vistoEm',\s*'atualizadoEm'\s*\]\)/);
  assert.match(rulesText, /allow delete:\s*if admin\(\)/);

  // Bloqueio explícito de estado inicial na criação pública
  assert.match(rulesText, /incoming\(\)\.status == 'Novo'/);
  assert.match(rulesText, /incoming\(\)\.visto == false/);
  assert.match(rulesText, /incoming\(\)\.vistoEm == null/);
  assert.match(rulesText, /incoming\(\)\.observacoes == ''/);

  // Regras de /termos, /usuarios e /auditoria
  assert.match(rulesText, /match \/termos\/\{termoId\}[\s\S]*allow update:\s*if false;/);
  assert.match(rulesText, /match \/usuarios\/\{uid\}/);
  assert.match(rulesText, /allow list:\s*if admin\(\);/);
  assert.match(rulesText, /match \/auditoria\/\{auditoriaId\}/);
  assert.match(rulesText, /allow get, list:\s*if admin\(\);/);
  assert.match(rulesText, /allow create:\s*if equipe\(\)[\s\S]*incoming\(\)\.uid == request\.auth\.uid/);
  assert.match(rulesText, /allow update, delete:\s*if false;/);

  // Negação padrão no fechamento
  assert.match(rulesText, /match \/\{document=\*\*\}[\s\S]*allow read, write:\s*if false;/);
});

test('contractorRegistrationSchema rejeita CPF ou CNPJ repetido ou inválido', () => {
  const invalidPayload = {
    registrationDate: '2026-11-18',
    role: 'Técnico de Instalação',
    fullName: 'Carlos Silva',
    cpf: '111.111.111-11',
    rg: '12.345.678-9',
    birthPlace: 'São Paulo',
    nationality: 'Brasileira',
    maritalStatus: 'Solteiro(a)',
    birthDate: '1990-01-01',
    cnpj: '11.111.111/1111-11',
    companyAddress: 'Rua Teste, 123',
    companyCep: '01310-100',
    fatherName: 'João Silva',
    motherName: 'Maria Silva',
    email: 'carlos@teste.com.br',
    phone: '(11) 99999-8888',
  };

  const parsed = contractorRegistrationSchema.safeParse(invalidPayload);
  assert.equal(parsed.success, false);
});
