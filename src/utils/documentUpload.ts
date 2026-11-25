import {
  DOCUMENT_MIME_TYPES,
  MAX_REGISTRATION_DOCUMENT_BYTES,
  registrationDocumentAttachmentSchema,
  type RegistrationDocumentAttachment,
  type RegistrationDocumentAttachmentInput,
  type RegistrationDocumentMimeType,
  type RegistrationDocumentType,
} from '../shared/schema.ts';

export interface DocumentUploadSlotConfig {
  type: RegistrationDocumentType;
  title: string;
  description: string;
  accept: string;
}

export const REGISTRATION_DOCUMENT_SLOTS: readonly DocumentUploadSlotConfig[] = [
  {
    type: 'rg',
    title: 'RG',
    description: 'Documento de identidade (foto ou PDF)',
    accept: '.pdf,image/jpeg,image/png,image/webp',
  },
  {
    type: 'cnh',
    title: 'CNH',
    description: 'Carteira Nacional de Habilitação (foto ou PDF)',
    accept: '.pdf,image/jpeg,image/png,image/webp',
  },
  {
    type: 'certificado_mei',
    title: 'Certificado MEI',
    description: 'CCMEI — Certificado da Condição de Microempreendedor Individual',
    accept: '.pdf,image/jpeg,image/png,image/webp',
  },
] as const;

export const MAX_PDF_UPLOAD_BYTES = 650 * 1024;
const TARGET_IMAGE_BYTES = 520 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

export function sanitizeAttachmentFileName(rawName: string): string {
  const trimmed = rawName.trim().replace(/[/\\?%*:|"<>]/g, '_');
  if (!trimmed) return 'documento';
  if (trimmed.length <= 180) return trimmed;
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex > 0 && trimmed.length - dotIndex <= 10) {
    const ext = trimmed.slice(dotIndex);
    return `${trimmed.slice(0, 180 - ext.length)}${ext}`;
  }
  return trimmed.slice(0, 180);
}

export function formatBytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function resolveFileMimeType(file: File): RegistrationDocumentMimeType | null {
  const mime = (file.type || '').toLowerCase();
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) {
    return mime as RegistrationDocumentMimeType;
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  return null;
}

async function compressImageFileToJpeg(file: File): Promise<{
  bytes: Uint8Array;
  mimeType: RegistrationDocumentMimeType;
  fileName: string;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      image.src = objectUrl;
    });

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width || 1, img.height || 1));
    const targetWidth = Math.max(1, Math.round((img.width || 1) * scale));
    const targetHeight = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Não foi possível processar a imagem no navegador.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const qualities = [0.86, 0.75, 0.62, 0.5, 0.38];
    let lastBytes: Uint8Array | null = null;

    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );
      if (!blob) continue;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      lastBytes = buffer;
      if (buffer.byteLength <= TARGET_IMAGE_BYTES) {
        break;
      }
    }

    if (!lastBytes || lastBytes.byteLength > MAX_REGISTRATION_DOCUMENT_BYTES) {
      throw new Error(
        'A imagem selecionada excede o limite permitido mesmo após otimização. Tente uma foto menor.'
      );
    }

    const baseName = sanitizeAttachmentFileName(file.name).replace(/\.[^.]+$/, '');
    return {
      bytes: lastBytes,
      mimeType: 'image/jpeg',
      fileName: `${baseName || 'documento'}.jpg`,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareAttachmentFile(
  file: File,
  tipo: RegistrationDocumentType
): Promise<RegistrationDocumentAttachmentInput> {
  const resolvedMime = resolveFileMimeType(file);
  if (!resolvedMime) {
    throw new Error('Formato não suportado. Envie um arquivo PDF, JPG, PNG ou WEBP.');
  }

  let finalBytes: Uint8Array;
  let finalMime: RegistrationDocumentMimeType = resolvedMime;
  let finalName = sanitizeAttachmentFileName(file.name);

  if (resolvedMime === 'application/pdf') {
    if (file.size === 0) {
      throw new Error('O arquivo PDF selecionado está vazio.');
    }
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      throw new Error(
        `O PDF "${finalName}" (${formatBytesLabel(file.size)}) ultrapassa o limite de ${formatBytesLabel(MAX_PDF_UPLOAD_BYTES)}. Comprima o PDF ou envie uma foto/imagem.`
      );
    }
    finalBytes = new Uint8Array(await file.arrayBuffer());
  } else {
    if (file.size === 0) {
      throw new Error('A imagem selecionada está vazia.');
    }
    if (file.size <= 450 * 1024) {
      finalBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const compressed = await compressImageFileToJpeg(file);
      finalBytes = compressed.bytes;
      finalMime = compressed.mimeType;
      finalName = compressed.fileName;
    }
  }

  const base64 = uint8ArrayToBase64(finalBytes);
  return registrationDocumentAttachmentSchema.parse({
    tipo,
    nomeArquivo: finalName,
    mimeType: finalMime,
    tamanhoBytes: finalBytes.byteLength,
    conteudoBase64: base64,
  });
}

export function buildAttachmentDataUrl(
  attachment: Pick<RegistrationDocumentAttachment, 'mimeType' | 'conteudoBase64'>
): string {
  return `data:${attachment.mimeType};base64,${attachment.conteudoBase64}`;
}

export function downloadAttachmentFile(
  attachment: Pick<
    RegistrationDocumentAttachment,
    'nomeArquivo' | 'mimeType' | 'conteudoBase64'
  >
): void {
  const bytes = base64ToUint8Array(attachment.conteudoBase64);
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: attachment.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = sanitizeAttachmentFileName(attachment.nomeArquivo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
