export const BRAND_CONFIG = {
  companyName: 'Ameta',
  primaryColor: '#0F2942',
  accentColor: '#1E40AF',
} as const;

/**
 * Opções da lista suspensa "Qual será a sua função na empresa".
 * Para alterar, adicionar ou remover funções, edite este array mantendo valores em texto simples.
 */
export const ROLE_OPTIONS = [
  'Analista de documentação',
  'Técnico de Instalação',
  'Técnico de Vistoria',
] as const;

/**
 * Opções da lista suspensa "Estado Civil".
 * Para alterar as opções disponíveis, edite este array.
 */
export const MARITAL_STATUS_OPTIONS = [
  'Solteiro(a)',
  'Casado(a)',
  'União Estável',
  'Divorciado(a)',
  'Separado(a)',
  'Viúvo(a)',
] as const;

export const REGISTRATION_STATUS_OPTIONS = [
  'Novo',
  'Em análise',
  'Dados conferidos',
  'Concluído',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUS_OPTIONS)[number];

export const REGISTRATION_FIELD_LABELS = [
  { key: 'registrationDate', label: 'Data da Cadastro' },
  { key: 'role', label: 'Qual será a sua função na empresa' },
  { key: 'fullName', label: 'Nome Completo' },
  { key: 'cpf', label: 'Informe seu CPF' },
  { key: 'rg', label: 'Informe seu RG' },
  { key: 'birthPlace', label: 'Informe sua Naturalidade' },
  { key: 'nationality', label: 'Informe sua Nacionalidade' },
  { key: 'maritalStatus', label: 'Estado Civil' },
  { key: 'birthDate', label: 'DATA DE NASCIMENTO' },
  { key: 'cnpj', label: 'Informe o CNPJ de sua empresa' },
  { key: 'companyAddress', label: 'Informe endereço da sua empresa' },
  { key: 'companyCep', label: 'Informe o CEP da sua empresa' },
  { key: 'fatherName', label: 'Nome completo do Pai' },
  { key: 'motherName', label: 'Nome completo da Mãe' },
  { key: 'email', label: 'Informe seu Email' },
  { key: 'phone', label: 'Informe o seu Telefone com DDD' },
] as const;
