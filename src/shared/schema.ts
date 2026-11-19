import { z } from 'zod';
import {
  MARITAL_STATUS_OPTIONS,
  REGISTRATION_STATUS_OPTIONS,
  ROLE_OPTIONS,
  type RegistrationStatus,
} from './formConfig.ts';
import { isValidCNPJ, isValidCPF, onlyDigits } from './validators.ts';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!isoDateRegex.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const contractorRegistrationSchema = z.object({
  registrationDate: z
    .string({ message: 'Informe a Data da Cadastro.' })
    .trim()
    .refine(isValidCalendarDate, {
      message: 'Informe uma Data da Cadastro válida.',
    }),
  role: z
    .string({ message: 'Selecione uma função na empresa.' })
    .trim()
    .refine((val) => (ROLE_OPTIONS as readonly string[]).includes(val), {
      message: 'Selecione uma função válida na lista.',
    }),
  fullName: z
    .string({ message: 'Informe seu Nome Completo.' })
    .trim()
    .min(3, { message: 'O Nome Completo deve ter pelo menos 3 caracteres.' })
    .max(150, { message: 'O Nome Completo não pode ultrapassar 150 caracteres.' })
    .refine((val) => val.split(/\s+/).filter(Boolean).length >= 2, {
      message: 'Informe nome e sobrenome completos.',
    }),
  cpf: z
    .string({ message: 'Informe seu CPF.' })
    .trim()
    .refine((val) => isValidCPF(val), {
      message: 'CPF inválido. Verifique os 11 dígitos informados.',
    }),
  rg: z
    .string({ message: 'Informe seu RG.' })
    .trim()
    .min(5, { message: 'Informe um número de RG válido.' })
    .max(30, { message: 'O RG informado é muito longo.' }),
  birthPlace: z
    .string({ message: 'Informe sua Naturalidade.' })
    .trim()
    .min(2, { message: 'Informe sua Naturalidade.' })
    .max(120, { message: 'A Naturalidade não pode ultrapassar 120 caracteres.' }),
  nationality: z
    .string({ message: 'Informe sua Nacionalidade.' })
    .trim()
    .min(2, { message: 'Informe sua Nacionalidade.' })
    .max(80, { message: 'A Nacionalidade não pode ultrapassar 80 caracteres.' }),
  maritalStatus: z
    .string({ message: 'Selecione o Estado Civil.' })
    .trim()
    .refine((val) => (MARITAL_STATUS_OPTIONS as readonly string[]).includes(val), {
      message: 'Selecione um Estado Civil válido.',
    }),
  birthDate: z
    .string({ message: 'Informe a DATA DE NASCIMENTO.' })
    .trim()
    .refine(isValidCalendarDate, {
      message: 'Informe uma DATA DE NASCIMENTO válida.',
    })
    .refine((val) => {
      const birth = new Date(`${val}T00:00:00Z`);
      const now = new Date();
      const minBirth = new Date(Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate()));
      const maxBirth = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()));
      return birth >= minBirth && birth <= maxBirth;
    }, {
      message: 'O prestador deve ter pelo menos 16 anos e data de nascimento válida.',
    }),
  cnpj: z
    .string({ message: 'Informe o CNPJ de sua empresa.' })
    .trim()
    .refine((val) => isValidCNPJ(val), {
      message: 'CNPJ inválido. Verifique os 14 dígitos informados.',
    }),
  companyAddress: z
    .string({ message: 'Informe o endereço da sua empresa.' })
    .trim()
    .min(5, { message: 'Informe o endereço completo da empresa.' })
    .max(250, { message: 'O endereço não pode ultrapassar 250 caracteres.' }),
  companyCep: z
    .string({ message: 'Informe o CEP da sua empresa.' })
    .trim()
    .refine((val) => onlyDigits(val).length === 8, {
      message: 'CEP inválido. Informe os 8 dígitos do CEP.',
    }),
  fatherName: z
    .string({ message: 'Informe o nome completo do Pai.' })
    .trim()
    .min(3, { message: 'Informe o nome completo do Pai.' })
    .max(150, { message: 'O nome do Pai não pode ultrapassar 150 caracteres.' }),
  motherName: z
    .string({ message: 'Informe o nome completo da Mãe.' })
    .trim()
    .min(3, { message: 'Informe o nome completo da Mãe.' })
    .max(150, { message: 'O nome da Mãe não pode ultrapassar 150 caracteres.' }),
  email: z
    .string({ message: 'Informe seu Email.' })
    .trim()
    .toLowerCase()
    .email({ message: 'Informe um endereço de e-mail válido.' })
    .max(160, { message: 'O e-mail não pode ultrapassar 160 caracteres.' }),
  phone: z
    .string({ message: 'Informe o seu Telefone com DDD.' })
    .trim()
    .refine((val) => {
      const digits = onlyDigits(val);
      return digits.length === 10 || digits.length === 11;
    }, {
      message: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).',
    }),
});

export type ContractorRegistrationInput = z.infer<typeof contractorRegistrationSchema>;

export interface ContractorRegistrationListItem {
  id: string;
  registrationDate: string;
  role: string;
  fullName: string;
  cpfMasked: string;
  rgMasked: string;
  cnpj: string;
  email: string;
  status: RegistrationStatus;
  viewedAt: string | null;
  createdAt: string;
}

export interface ContractorRegistrationDetail extends ContractorRegistrationInput {
  id: string;
  status: RegistrationStatus;
  internalNotes: string;
  viewed: boolean;
  viewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const registrationAdminMetaSchema = z.object({
  status: z
    .string()
    .refine((val) => (REGISTRATION_STATUS_OPTIONS as readonly string[]).includes(val), {
      message: 'Status inválido.',
    })
    .optional(),
  internalNotes: z
    .string()
    .max(4000, { message: 'Observações internas podem ter no máximo 4000 caracteres.' })
    .optional(),
  viewed: z.boolean().optional(),
});

export type PanelUserRole = 'administrador' | 'operador';

export interface PanelUserProfile {
  uid: string;
  nome: string;
  email: string;
  perfil: PanelUserRole;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export const panelUserCreateSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do usuário.').max(150),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(160),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').max(100),
  perfil: z.enum(['administrador', 'operador']),
});

export interface DiscountTermTemplateFields {
  CONTRATADA_RAZAO_SOCIAL: string;
  CONTRATADA_CNPJ: string;
  CONTRATADA_ENDERECO: string;
  VALOR_TOTAL: string;
  VALOR_EXTENSO: string;
  MARCA_INTEGRAL: string;
  MARCA_PARCELADO: string;
  NUM_PARCELAS: string;
  NUM_PARCELAS_EXTENSO: string;
  VALOR_PARCELA: string;
  MES_ANO_INICIO: string;
  LOCAL_DATA: string;
}

export const discountTermGenerateSchema = z.object({
  paymentMode: z.enum(['integral', 'parcelado', 'blank']),
  totalValueDisplay: z.string().max(40),
  totalValueWords: z.string().max(300),
  installmentsCount: z.string().max(20),
  installmentsWords: z.string().max(120),
  installmentValueDisplay: z.string().max(40),
  startMonthYear: z.string().max(40),
  localDate: z.string().max(150),
  contractorCompanyName: z.string().max(200),
  contractorCnpj: z.string().max(30),
  contractorAddress: z.string().max(350),
  templateFields: z.object({
    CONTRATADA_RAZAO_SOCIAL: z.string().max(250),
    CONTRATADA_CNPJ: z.string().max(40),
    CONTRATADA_ENDERECO: z.string().max(350),
    VALOR_TOTAL: z.string().max(60),
    VALOR_EXTENSO: z.string().max(300),
    MARCA_INTEGRAL: z.string().max(10),
    MARCA_PARCELADO: z.string().max(10),
    NUM_PARCELAS: z.string().max(30),
    NUM_PARCELAS_EXTENSO: z.string().max(120),
    VALOR_PARCELA: z.string().max(60),
    MES_ANO_INICIO: z.string().max(60),
    LOCAL_DATA: z.string().max(180),
  }),
  requestedFormat: z.enum(['docx', 'pdf']),
});

export type DiscountTermGenerateInput = z.infer<typeof discountTermGenerateSchema>;

export interface DiscountTermHistoryItem {
  id: string;
  registrationId: string;
  contractorCompanyName: string;
  contractorCnpj: string;
  totalValueDisplay: string;
  paymentMode: 'integral' | 'parcelado' | 'blank';
  installmentsCount: string;
  installmentValueDisplay: string;
  startMonthYear: string;
  localDate: string;
  templateFields: DiscountTermTemplateFields;
  generatedByUserId: string;
  generatedByName: string;
  generatedByEmail: string;
  createdAt: string;
}

export type AuditAction =
  | 'ABRIU_CADASTRO'
  | 'EDITOU_CADASTRO'
  | 'ALTEROU_STATUS'
  | 'SALVOU_OBSERVACOES'
  | 'EXCLUIU_CADASTRO'
  | 'GEROU_TERMO_DOCX'
  | 'GEROU_TERMO_PDF'
  | 'REBAIXOU_TERMO_DOCX'
  | 'REBAIXOU_TERMO_PDF'
  | 'CRIOU_USUARIO'
  | 'ATUALIZOU_USUARIO'
  | 'REMOVEU_USUARIO';

export interface AuditLogItem {
  id: string;
  acao: AuditAction;
  entidade: 'cadastros' | 'termos' | 'usuarios';
  entidadeId: string;
  cadastroId: string;
  atorUid: string;
  atorNome: string;
  atorEmail: string;
  detalhes: Record<string, string>;
  criadoEm: string;
}
