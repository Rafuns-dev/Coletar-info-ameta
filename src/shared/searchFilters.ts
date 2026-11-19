import type { ContractorRegistrationDetail } from './schema.ts';
import { onlyDigits } from './validators.ts';

export type SortOption =
  | 'registrationDate:desc'
  | 'registrationDate:asc'
  | 'fullName:asc'
  | 'fullName:desc'
  | 'status:asc';

export interface FilterCriteria {
  search?: string;
  roles?: string[];
  maritalStatus?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  birthPlace?: string;
  nationality?: string;
  unseenOnly?: boolean;
  sort?: SortOption;
}

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function filterAndSortRegistrations(
  records: ContractorRegistrationDetail[],
  criteria: FilterCriteria
): ContractorRegistrationDetail[] {
  const searchRaw = (criteria.search || '').trim();
  const searchNorm = normalizeSearchText(searchRaw);
  const searchDigits = onlyDigits(searchRaw);

  const rolesSet =
    criteria.roles && criteria.roles.length > 0 ? new Set(criteria.roles) : null;
  const birthPlaceNorm = normalizeSearchText(criteria.birthPlace || '');
  const nationalityNorm = normalizeSearchText(criteria.nationality || '');

  const filtered = records.filter((item) => {
    if (rolesSet && !rolesSet.has(item.role)) {
      return false;
    }

    if (criteria.maritalStatus && criteria.maritalStatus !== 'ALL') {
      if (item.maritalStatus !== criteria.maritalStatus) {
        return false;
      }
    }

    if (criteria.status && criteria.status !== 'ALL') {
      if (item.status !== criteria.status) {
        return false;
      }
    }

    if (criteria.dateFrom && item.registrationDate < criteria.dateFrom) {
      return false;
    }

    if (criteria.dateTo && item.registrationDate > criteria.dateTo) {
      return false;
    }

    if (birthPlaceNorm) {
      if (!normalizeSearchText(item.birthPlace).includes(birthPlaceNorm)) {
        return false;
      }
    }

    if (nationalityNorm) {
      if (!normalizeSearchText(item.nationality).includes(nationalityNorm)) {
        return false;
      }
    }

    if (criteria.unseenOnly && item.viewed) {
      return false;
    }

    if (searchNorm) {
      const textFields = [
        item.fullName,
        item.email,
        item.cpf,
        item.rg,
        item.cnpj,
        item.phone,
        item.role,
      ];
      const textMatch = textFields.some((f) => normalizeSearchText(f).includes(searchNorm));

      if (textMatch) {
        return true;
      }

      if (searchDigits.length >= 2) {
        const digitFields = [item.cpf, item.rg, item.cnpj, item.phone];
        const digitsMatch = digitFields.some((f) => onlyDigits(f).includes(searchDigits));
        if (digitsMatch) {
          return true;
        }
      }

      return false;
    }

    return true;
  });

  const sortOption = criteria.sort || 'registrationDate:desc';

  return [...filtered].sort((a, b) => {
    switch (sortOption) {
      case 'registrationDate:asc': {
        const cmp = a.registrationDate.localeCompare(b.registrationDate);
        return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt);
      }
      case 'registrationDate:desc': {
        const cmp = b.registrationDate.localeCompare(a.registrationDate);
        return cmp !== 0 ? cmp : b.createdAt.localeCompare(a.createdAt);
      }
      case 'fullName:asc':
        return a.fullName.localeCompare(b.fullName, 'pt-BR', { sensitivity: 'base' });
      case 'fullName:desc':
        return b.fullName.localeCompare(a.fullName, 'pt-BR', { sensitivity: 'base' });
      case 'status:asc': {
        const cmp = a.status.localeCompare(b.status, 'pt-BR', { sensitivity: 'base' });
        return cmp !== 0 ? cmp : b.registrationDate.localeCompare(a.registrationDate);
      }
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}
