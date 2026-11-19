import * as XLSX from 'xlsx';
import { REGISTRATION_FIELD_LABELS } from '../shared/formConfig.ts';
import type { ContractorRegistrationDetail } from '../shared/schema.ts';
import { formatDateBR, formatDateTimeBR } from '../shared/validators.ts';

function formatCsvValue(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  const escaped = safeValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export function exportRegistrationsToExcel(records: ContractorRegistrationDetail[]): void {
  if (records.length === 0) return;

  const sheetRows = records.map((item) => {
    const row: Record<string, string> = {};
    for (const field of REGISTRATION_FIELD_LABELS) {
      const val = item[field.key];
      row[field.label] =
        field.key === 'registrationDate' || field.key === 'birthDate'
          ? formatDateBR(val)
          : val;
    }
    row['Status'] = item.status;
    row['Observações internas'] = item.internalNotes || '';
    row['Enviado em'] = formatDateTimeBR(item.createdAt);
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cadastros Ameta');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const timestamp = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `ameta-prestadores-${timestamp}.xlsx`
  );
}

export function exportRegistrationsToCsv(records: ContractorRegistrationDetail[]): void {
  if (records.length === 0) return;

  const headers = [
    ...REGISTRATION_FIELD_LABELS.map((f) => f.label),
    'Status',
    'Observações internas',
    'Enviado em',
  ];

  const lines: string[] = [headers.map(formatCsvValue).join(';')];

  for (const item of records) {
    const rowValues = [
      ...REGISTRATION_FIELD_LABELS.map((field) => {
        const val = item[field.key];
        return field.key === 'registrationDate' || field.key === 'birthDate'
          ? formatDateBR(val)
          : val;
      }),
      item.status,
      item.internalNotes || '',
      formatDateTimeBR(item.createdAt),
    ];
    lines.push(rowValues.map(formatCsvValue).join(';'));
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
    `ameta-prestadores-${timestamp}.csv`
  );
}
