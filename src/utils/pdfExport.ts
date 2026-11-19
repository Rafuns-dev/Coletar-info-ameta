import { jsPDF } from 'jspdf';
import { REGISTRATION_FIELD_LABELS } from '../shared/formConfig.ts';
import type { ContractorRegistrationDetail } from '../shared/schema.ts';
import { formatDateBR, formatDateTimeBR } from '../shared/validators.ts';

export function formatRegistrationAsText(record: ContractorRegistrationDetail): string {
  const lines = REGISTRATION_FIELD_LABELS.map((field, index) => {
    const rawValue = record[field.key];
    const formatted =
      field.key === 'registrationDate' || field.key === 'birthDate'
        ? formatDateBR(rawValue)
        : rawValue;
    return `${index + 1}. ${field.label}: ${formatted}`;
  });
  lines.push(`Status: ${record.status}`);
  lines.push(`Enviado em: ${formatDateTimeBR(record.createdAt)}`);
  return lines.join('\n');
}

function renderRegistrationSheet(
  doc: jsPDF,
  record: ContractorRegistrationDetail,
  isFirstPage: boolean
): void {
  if (!isFirstPage) {
    doc.addPage();
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFillColor(15, 41, 66);
  doc.rect(margin, y - 6, 8, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('A', margin + 2.6, y - 0.5);

  doc.setTextColor(15, 41, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Ameta', margin + 11, y - 0.3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Ficha Cadastral de Prestador PJ (Primeiro Contato)', margin, y + 6);

  doc.setFontSize(8.5);
  doc.text(
    `Status: ${record.status}  |  Enviado em: ${formatDateTimeBR(record.createdAt)}`,
    pageWidth - margin,
    y + 6,
    { align: 'right' }
  );

  y += 11;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  for (let i = 0; i < REGISTRATION_FIELD_LABELS.length; i++) {
    const field = REGISTRATION_FIELD_LABELS[i];
    const rawVal = record[field.key];
    const displayValue =
      field.key === 'registrationDate' || field.key === 'birthDate'
        ? formatDateBR(rawVal)
        : rawVal;

    const labelText = `${i + 1}. ${field.label}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(labelText, margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(displayValue || '-', contentWidth) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5 + 2.5;

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.25);
    doc.line(margin, y - 1, pageWidth - margin, y - 1);
    y += 2.5;

    if (y > 272 && i < REGISTRATION_FIELD_LABELS.length - 1) {
      doc.addPage();
      y = 20;
    }
  }
}

export function exportRegistrationToPdf(record: ContractorRegistrationDetail): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  renderRegistrationSheet(doc, record, true);

  const safeSlug = record.fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  doc.save(`ameta-ficha-${safeSlug || record.id}.pdf`);
}

export function exportFilteredListToPdf(records: ContractorRegistrationDetail[]): void {
  if (records.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  records.forEach((record, index) => {
    renderRegistrationSheet(doc, record, index === 0);
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`ameta-cadastros-filtrados-${dateStr}.pdf`);
}
