import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  createSecondaryAuthUserAndSendPasswordSetup,
  db,
  firebaseRuntimeConfig,
  handleFirestoreError,
  OperationType,
} from '../firebase.ts';
import type { RegistrationStatus } from '../shared/formConfig.ts';
import {
  contractorRegistrationSchema,
  registrationDocumentAttachmentSchema,
  type AuditAction,
  type AuditLogItem,
  type ContractorRegistrationDetail,
  type ContractorRegistrationInput,
  type DiscountTermGenerateInput,
  type DiscountTermHistoryItem,
  type DiscountTermTemplateFields,
  type PanelUserProfile,
  type PanelUserRole,
  type RegistrationDocumentAttachment,
  type RegistrationDocumentAttachmentInput,
  type RegistrationDocumentMimeType,
  type RegistrationDocumentType,
} from '../shared/schema.ts';
import {
  filterAndSortRegistrations,
  type FilterCriteria,
  type SortOption,
} from '../shared/searchFilters.ts';
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  onlyDigits,
} from '../shared/validators.ts';

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function normalizeCadastroPayload(raw: ContractorRegistrationInput) {
  const parsed = contractorRegistrationSchema.parse(raw);
  const nomeCompleto = parsed.fullName.trim();
  const cpf = formatCPF(parsed.cpf);
  const cnpj = formatCNPJ(parsed.cnpj);
  const cepEmpresa = formatCEP(parsed.companyCep);
  const telefone = formatPhone(parsed.phone);

  return {
    dataCadastro: parsed.registrationDate.trim(),
    funcao: parsed.role.trim(),
    nomeCompleto,
    nomeCompletoLower: nomeCompleto.toLowerCase(),
    cpf,
    cpfDigitos: onlyDigits(cpf),
    rg: parsed.rg.trim(),
    naturalidade: parsed.birthPlace.trim(),
    nacionalidade: parsed.nationality.trim(),
    estadoCivil: parsed.maritalStatus.trim(),
    dataNascimento: parsed.birthDate.trim(),
    cnpj,
    cnpjDigitos: onlyDigits(cnpj),
    enderecoEmpresa: parsed.companyAddress.trim(),
    cepEmpresa,
    cepDigitos: onlyDigits(cepEmpresa),
    nomePai: parsed.fatherName.trim(),
    nomeMae: parsed.motherName.trim(),
    email: parsed.email.trim().toLowerCase(),
    telefone,
    telefoneDigitos: onlyDigits(telefone),
  };
}

function mapCadastroDoc(
  id: string,
  data: Record<string, unknown>
): ContractorRegistrationDetail {
  return {
    id,
    registrationDate: String(data.dataCadastro || ''),
    role: String(data.funcao || ''),
    fullName: String(data.nomeCompleto || ''),
    cpf: String(data.cpf || ''),
    rg: String(data.rg || ''),
    birthPlace: String(data.naturalidade || ''),
    nationality: String(data.nacionalidade || ''),
    maritalStatus: String(data.estadoCivil || ''),
    birthDate: String(data.dataNascimento || ''),
    cnpj: String(data.cnpj || ''),
    companyAddress: String(data.enderecoEmpresa || ''),
    companyCep: String(data.cepEmpresa || ''),
    fatherName: String(data.nomePai || ''),
    motherName: String(data.nomeMae || ''),
    email: String(data.email || ''),
    phone: String(data.telefone || ''),
    status: (data.status as RegistrationStatus) || 'Novo',
    internalNotes: String(data.observacoes || ''),
    viewed: Boolean(data.visto),
    viewedAt: data.vistoEm ? toIsoString(data.vistoEm) : null,
    createdAt: toIsoString(data.criadoEm),
    updatedAt: toIsoString(data.atualizadoEm),
  };
}

function mapDocumentoDoc(
  id: string,
  data: Record<string, unknown>
): RegistrationDocumentAttachment {
  return {
    id: id as RegistrationDocumentType,
    tipo: (data.tipo as RegistrationDocumentType) || (id as RegistrationDocumentType),
    nomeArquivo: String(data.nomeArquivo || ''),
    mimeType: String(data.mimeType || 'application/pdf') as RegistrationDocumentMimeType,
    tamanhoBytes: Number(data.tamanhoBytes || 0),
    conteudoBase64: String(data.conteudoBase64 || ''),
    criadoEm: toIsoString(data.criadoEm),
    atualizadoEm: toIsoString(data.atualizadoEm ?? data.criadoEm),
  };
}

function mapTermoDoc(id: string, data: Record<string, unknown>): DiscountTermHistoryItem {
  return {
    id,
    registrationId: String(data.cadastroId || ''),
    contractorCompanyName: String(data.razaoSocialContratada || ''),
    contractorCnpj: String(data.cnpjContratada || ''),
    totalValueDisplay: String(data.valorTotal || ''),
    paymentMode: (data.formaAbatimento as 'integral' | 'parcelado' | 'blank') || 'integral',
    installmentsCount: String(data.numParcelas || ''),
    installmentValueDisplay: String(data.valorParcela || ''),
    startMonthYear: String(data.mesAnoInicio || ''),
    localDate: String(data.localData || ''),
    selectedDocuments: Array.isArray(data.documentosSelecionados)
      ? data.documentosSelecionados.map((item) => String(item))
      : [],
    templateFields: (data.camposTemplate || {}) as DiscountTermTemplateFields,
    generatedByUserId: String(data.geradoPorUid || ''),
    generatedByName: String(data.geradoPorNome || ''),
    generatedByEmail: String(data.geradoPorEmail || ''),
    createdAt: toIsoString(data.criadoEm),
  };
}

function mapUsuarioDoc(uid: string, data: Record<string, unknown>): PanelUserProfile {
  const rawRole = data.role ?? data.perfil;
  const role: PanelUserRole =
    rawRole === 'admin' || rawRole === 'administrador' ? 'admin' : 'operador';
  return {
    uid,
    nome: String(data.nome || ''),
    email: String(data.email || ''),
    role,
    ativo: Boolean(data.ativo),
    criadoEm: toIsoString(data.criadoEm),
    atualizadoEm: toIsoString(data.atualizadoEm ?? data.criadoEm),
  };
}

function mapAuditoriaDoc(id: string, data: Record<string, unknown>): AuditLogItem {
  return {
    id,
    acao: data.acao as AuditAction,
    entidade:
      (data.entidade as 'sessao' | 'cadastros' | 'termos' | 'usuarios') || 'cadastros',
    entidadeId: String(data.entidadeId || ''),
    cadastroId: String(data.cadastroId || ''),
    uid: String(data.uid || data.atorUid || ''),
    nome: String(data.nome || data.atorNome || ''),
    email: String(data.email || data.atorEmail || ''),
    detalhes: (data.detalhes || {}) as Record<string, string>,
    criadoEm: toIsoString(data.criadoEm),
  };
}

export interface ExtractedFirebaseErrorDetails {
  code?: string;
  message: string;
  operationType?: string;
  path?: string | null;
}

export function extractFirebaseErrorDetails(
  err: unknown,
  fallback = 'Erro desconhecido.'
): ExtractedFirebaseErrorDetails {
  if (err instanceof FirebaseError) {
    return {
      code: err.code,
      message: err.message || fallback,
    };
  }
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as {
        error?: string;
        code?: string;
        operationType?: string;
        path?: string | null;
      };
      if (parsed && typeof parsed.error === 'string') {
        return {
          code: parsed.code,
          message: parsed.error,
          operationType: parsed.operationType,
          path: parsed.path,
        };
      }
    } catch {
      // mensagem comum
    }
    return {
      message: err.message || fallback,
    };
  }
  return {
    message: typeof err === 'string' && err ? err : fallback,
  };
}

export function extractFriendlyFirestoreMessage(
  err: unknown,
  fallback = 'Não foi possível concluir a operação.',
  includeDiagnostic = false
): string {
  const details = extractFirebaseErrorDetails(err, fallback);
  const lowerErr = details.message.toLowerCase();
  const lowerCode = (details.code || '').toLowerCase();

  let friendly = details.message || fallback;
  if (lowerCode.includes('permission') || lowerErr.includes('permission')) {
    if (details.operationType === 'create' && details.path === 'cadastros') {
      friendly =
        'Não foi possível concluir o envio. Verifique se este CPF ou CNPJ já possui cadastro enviado anteriormente ou confira os dados informados.';
    } else {
      friendly = 'Acesso não autorizado ou permissão negada pelo Firestore.';
    }
  } else if (lowerCode.includes('resource-exhausted') || lowerErr.includes('quota')) {
    friendly = 'Cota diária do Firestore atingida. Tente novamente mais tarde.';
  } else if (lowerCode.includes('unavailable') || lowerErr.includes('offline')) {
    friendly = 'Sem conexão com o Firestore no momento. Verifique sua internet e tente novamente.';
  }

  if (!includeDiagnostic) {
    return friendly;
  }
  const codeLabel = details.code || 'firestore-error';
  return `${friendly} (${codeLabel}: ${details.message})`;
}

export async function recordAuditLog(params: {
  acao: AuditAction;
  entidade: 'sessao' | 'cadastros' | 'termos' | 'usuarios';
  entidadeId: string;
  cadastroId?: string;
  actor: PanelUserProfile;
  detalhes?: Record<string, string>;
}): Promise<void> {
  const path = 'auditoria';
  const rawDetalhes = params.detalhes ?? {};
  const sanitizedDetalhes =
    typeof rawDetalhes.resumo === 'string'
      ? { ...rawDetalhes, resumo: rawDetalhes.resumo.slice(0, 400) }
      : rawDetalhes;
  try {
    await addDoc(collection(db, path), {
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      cadastroId: params.cadastroId ?? '',
      uid: params.actor.uid,
      nome: params.actor.nome,
      email: params.actor.email,
      detalhes: sanitizedDetalhes,
      criadoEm: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordSessionAudit(
  actor: PanelUserProfile,
  acao: 'LOGIN' | 'LOGOUT' | 'LOGOUT_INATIVIDADE'
): Promise<void> {
  const resumo =
    acao === 'LOGIN'
      ? 'Login realizado no painel administrativo'
      : acao === 'LOGOUT_INATIVIDADE'
        ? 'Sessão encerrada automaticamente após 30 minutos sem atividade'
        : 'Logout manual realizado no painel';

  await recordAuditLog({
    acao,
    entidade: 'sessao',
    entidadeId: actor.uid,
    cadastroId: '',
    actor,
    detalhes: { resumo },
  });
}

// ==================== FORMULÁRIO PÚBLICO ====================

async function submitPublicRegistrationViaRest(params: {
  cadastroId: string;
  normalized: ReturnType<typeof normalizeCadastroPayload>;
  attachments: RegistrationDocumentAttachmentInput[];
}): Promise<void> {
  const { projectId, databaseId, apiKey } = firebaseRuntimeConfig;
  const dbName = databaseId || '(default)';
  const docBase = `projects/${projectId}/databases/${dbName}/documents`;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbName)}/documents:commit?key=${encodeURIComponent(apiKey)}`;

  const toStr = (v: string) => ({ stringValue: v });

  const writes: Array<Record<string, unknown>> = [
    {
      update: {
        name: `${docBase}/cadastros/${params.cadastroId}`,
        fields: {
          dataCadastro: toStr(params.normalized.dataCadastro),
          funcao: toStr(params.normalized.funcao),
          nomeCompleto: toStr(params.normalized.nomeCompleto),
          nomeCompletoLower: toStr(params.normalized.nomeCompletoLower),
          cpf: toStr(params.normalized.cpf),
          cpfDigitos: toStr(params.normalized.cpfDigitos),
          rg: toStr(params.normalized.rg),
          naturalidade: toStr(params.normalized.naturalidade),
          nacionalidade: toStr(params.normalized.nacionalidade),
          estadoCivil: toStr(params.normalized.estadoCivil),
          dataNascimento: toStr(params.normalized.dataNascimento),
          cnpj: toStr(params.normalized.cnpj),
          cnpjDigitos: toStr(params.normalized.cnpjDigitos),
          enderecoEmpresa: toStr(params.normalized.enderecoEmpresa),
          cepEmpresa: toStr(params.normalized.cepEmpresa),
          cepDigitos: toStr(params.normalized.cepDigitos),
          nomePai: toStr(params.normalized.nomePai),
          nomeMae: toStr(params.normalized.nomeMae),
          email: toStr(params.normalized.email),
          telefone: toStr(params.normalized.telefone),
          telefoneDigitos: toStr(params.normalized.telefoneDigitos),
          status: toStr('Novo'),
          observacoes: toStr(''),
          visto: { booleanValue: false },
          vistoEm: { nullValue: null },
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: 'criadoEm', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'atualizadoEm', setToServerValue: 'REQUEST_TIME' },
      ],
    },
    {
      update: {
        name: `${docBase}/cadastros_chaves/cpf_${params.normalized.cpfDigitos}`,
        fields: {
          tipo: toStr('cpf'),
          valorDigitos: toStr(params.normalized.cpfDigitos),
          cadastroId: toStr(params.cadastroId),
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'criadoEm', setToServerValue: 'REQUEST_TIME' }],
    },
    {
      update: {
        name: `${docBase}/cadastros_chaves/cnpj_${params.normalized.cnpjDigitos}`,
        fields: {
          tipo: toStr('cnpj'),
          valorDigitos: toStr(params.normalized.cnpjDigitos),
          cadastroId: toStr(params.cadastroId),
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'criadoEm', setToServerValue: 'REQUEST_TIME' }],
    },
    ...params.attachments.map((attachment) => ({
      update: {
        name: `${docBase}/cadastros/${params.cadastroId}/documentos/${attachment.tipo}`,
        fields: {
          tipo: toStr(attachment.tipo),
          nomeArquivo: toStr(attachment.nomeArquivo),
          mimeType: toStr(attachment.mimeType),
          tamanhoBytes: { integerValue: String(attachment.tamanhoBytes) },
          conteudoBase64: toStr(attachment.conteudoBase64),
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: 'criadoEm', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'atualizadoEm', setToServerValue: 'REQUEST_TIME' },
      ],
    })),
  ];

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ writes }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { status?: string; message?: string };
      } | null;
      const code =
        response.status === 403
          ? 'permission-denied'
          : response.status === 409
            ? 'already-exists'
            : response.status === 503
              ? 'unavailable'
              : `http-${response.status}`;
      throw new FirebaseError(
        code,
        body?.error?.message || `HTTP ${response.status} ao gravar cadastro no Firestore.`
      );
    }
  } finally {
    window.clearTimeout(timer);
  }
}

export async function submitPublicRegistration(
  rawInput: ContractorRegistrationInput,
  attachments: RegistrationDocumentAttachmentInput[] = []
): Promise<string> {
  const normalized = normalizeCadastroPayload(rawInput);
  const parsedAttachments = attachments.map((item) =>
    registrationDocumentAttachmentSchema.parse(item)
  );
  const path = 'cadastros';
  const cadastroRef = doc(collection(db, path));
  const cpfLockRef = doc(db, 'cadastros_chaves', `cpf_${normalized.cpfDigitos}`);
  const cnpjLockRef = doc(db, 'cadastros_chaves', `cnpj_${normalized.cnpjDigitos}`);

  try {
    const batch = writeBatch(db);

    batch.set(cadastroRef, {
      ...normalized,
      status: 'Novo',
      observacoes: '',
      visto: false,
      vistoEm: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    batch.set(cpfLockRef, {
      tipo: 'cpf',
      valorDigitos: normalized.cpfDigitos,
      cadastroId: cadastroRef.id,
      criadoEm: serverTimestamp(),
    });

    batch.set(cnpjLockRef, {
      tipo: 'cnpj',
      valorDigitos: normalized.cnpjDigitos,
      cadastroId: cadastroRef.id,
      criadoEm: serverTimestamp(),
    });

    for (const attachment of parsedAttachments) {
      const docRef = doc(db, path, cadastroRef.id, 'documentos', attachment.tipo);
      batch.set(docRef, {
        tipo: attachment.tipo,
        nomeArquivo: attachment.nomeArquivo,
        mimeType: attachment.mimeType,
        tamanhoBytes: attachment.tamanhoBytes,
        conteudoBase64: attachment.conteudoBase64,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }

    let timeoutId: number | undefined;
    try {
      await Promise.race([
        batch.commit(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () =>
              reject(
                new FirebaseError(
                  'unavailable',
                  'Tempo limite ao gravar cadastro pelo canal em tempo real do Firestore.'
                )
              ),
            10000
          );
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }

    return cadastroRef.id;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const errCode = error instanceof FirebaseError ? error.code : '';
    const isTransientOffline =
      errCode === 'unavailable' ||
      errMsg.includes('offline') ||
      errMsg.includes('tempo limite');

    if (isTransientOffline && typeof fetch === 'function') {
      try {
        await submitPublicRegistrationViaRest({
          cadastroId: cadastroRef.id,
          normalized,
          attachments: parsedAttachments,
        });
        return cadastroRef.id;
      } catch (restError) {
        handleFirestoreError(restError, OperationType.CREATE, path);
      }
    }

    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ==================== AUTENTICAÇÃO E PERFIL DO PAINEL ====================

export type PanelUserAccessResult =
  | { status: 'authorized'; profile: PanelUserProfile }
  | { status: 'missing_doc'; uid: string; databaseId: string }
  | { status: 'inactive'; profile: PanelUserProfile }
  | { status: 'invalid_role'; uid: string; rawRole: string };

interface FirestoreRestValue {
  stringValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
}

function parseRestUsuarioFields(
  fields: Record<string, FirestoreRestValue> | undefined
): Record<string, unknown> {
  if (!fields) return {};
  return {
    nome: fields.nome?.stringValue ?? '',
    email: fields.email?.stringValue ?? '',
    role: fields.role?.stringValue ?? fields.perfil?.stringValue ?? '',
    ativo: Boolean(fields.ativo?.booleanValue),
    criadoEm: fields.criadoEm?.timestampValue ?? new Date().toISOString(),
    atualizadoEm:
      fields.atualizadoEm?.timestampValue ??
      fields.criadoEm?.timestampValue ??
      new Date().toISOString(),
  };
}

async function fetchUsuarioDocViaRest(
  firebaseUser: User
): Promise<{ exists: boolean; data?: Record<string, unknown> }> {
  const token = await firebaseUser.getIdToken();
  const { projectId, databaseId, apiKey } = firebaseRuntimeConfig;
  const dbName = databaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbName)}/documents/usuarios/${encodeURIComponent(firebaseUser.uid)}?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { exists: false };
    }

    const body = (await response.json().catch(() => null)) as {
      fields?: Record<string, FirestoreRestValue>;
      error?: { status?: string; message?: string };
    } | null;

    if (!response.ok) {
      const code =
        response.status === 403
          ? 'permission-denied'
          : response.status === 503
            ? 'unavailable'
            : `http-${response.status}`;
      throw new FirebaseError(
        code,
        body?.error?.message || `HTTP ${response.status} ao consultar usuarios/${firebaseUser.uid}.`
      );
    }

    return {
      exists: true,
      data: parseRestUsuarioFields(body?.fields),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function evaluateUsuarioAccess(
  uid: string,
  data: Record<string, unknown>
): PanelUserAccessResult {
  const rawRole = String(data.role ?? data.perfil ?? '').trim();
  if (rawRole !== 'admin' && rawRole !== 'administrador' && rawRole !== 'operador') {
    return {
      status: 'invalid_role',
      uid,
      rawRole: rawRole || '(vazio)',
    };
  }

  const profile = mapUsuarioDoc(uid, data);
  if (!profile.ativo) {
    return { status: 'inactive', profile };
  }
  return { status: 'authorized', profile };
}

export async function resolvePanelUserAccess(
  firebaseUser: User
): Promise<PanelUserAccessResult> {
  const userPath = `usuarios/${firebaseUser.uid}`;
  try {
    const snap = await Promise.race([
      getDoc(doc(db, 'usuarios', firebaseUser.uid)),
      new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new FirebaseError('unavailable', 'Tempo limite ao ler documento do usuário no Firestore.')),
          6000
        );
      }),
    ]);

    if (!snap.exists()) {
      return {
        status: 'missing_doc',
        uid: firebaseUser.uid,
        databaseId: firebaseRuntimeConfig.databaseId,
      };
    }

    return evaluateUsuarioAccess(snap.id, snap.data());
  } catch (error) {
    const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const errCode = error instanceof FirebaseError ? error.code : '';
    const isTransientOffline =
      errCode === 'unavailable' ||
      errMsg.includes('offline') ||
      errMsg.includes('tempo limite');

    if (isTransientOffline && typeof fetch === 'function') {
      try {
        const restRes = await fetchUsuarioDocViaRest(firebaseUser);
        if (!restRes.exists || !restRes.data) {
          return {
            status: 'missing_doc',
            uid: firebaseUser.uid,
            databaseId: firebaseRuntimeConfig.databaseId,
          };
        }
        return evaluateUsuarioAccess(firebaseUser.uid, restRes.data);
      } catch (restError) {
        handleFirestoreError(restError, OperationType.GET, userPath);
      }
    }

    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function resolvePanelUserProfile(
  firebaseUser: User
): Promise<PanelUserProfile | null> {
  const res = await resolvePanelUserAccess(firebaseUser);
  return res.status === 'authorized' ? res.profile : null;
}

// ==================== CADASTROS (PAINEL EM TEMPO REAL) ====================

export function subscribeToCadastros(
  onData: (items: ContractorRegistrationDetail[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'cadastros';
  const q = query(collection(db, path), orderBy('criadoEm', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => mapCadastroDoc(d.id, d.data()));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export type CadastroCursor = QueryDocumentSnapshot<DocumentData> | null;

export interface CadastrosCursorPageResult {
  items: ContractorRegistrationDetail[];
  nextCursor: CadastroCursor;
  hasMore: boolean;
  totalMatching: number;
}

function resolveFirestoreOrderClause(sort: SortOption = 'registrationDate:desc'): {
  field: string;
  direction: 'asc' | 'desc';
} {
  switch (sort) {
    case 'registrationDate:asc':
      return { field: 'dataCadastro', direction: 'asc' };
    case 'registrationDate:desc':
      return { field: 'dataCadastro', direction: 'desc' };
    case 'fullName:asc':
      return { field: 'nomeCompleto', direction: 'asc' };
    case 'fullName:desc':
      return { field: 'nomeCompleto', direction: 'desc' };
    case 'status:asc':
      return { field: 'status', direction: 'asc' };
    default:
      return { field: 'criadoEm', direction: 'desc' };
  }
}

export async function fetchCadastrosPageWithCursor(params: {
  pageSize: number;
  page?: number;
  cursor?: CadastroCursor;
  status?: string;
  role?: string;
  maritalStatus?: string;
  unseenOnly?: boolean;
  sort?: SortOption;
}): Promise<CadastrosCursorPageResult> {
  const path = 'cadastros';
  const coll = collection(db, path);
  const filters: QueryConstraint[] = [];

  if (params.status && params.status !== 'ALL') {
    filters.push(where('status', '==', params.status));
  }
  if (params.role) {
    filters.push(where('funcao', '==', params.role));
  }
  if (params.maritalStatus && params.maritalStatus !== 'ALL') {
    filters.push(where('estadoCivil', '==', params.maritalStatus));
  }
  if (params.unseenOnly) {
    filters.push(where('visto', '==', false));
  }

  const orderCfg = resolveFirestoreOrderClause(params.sort);
  const countQuery = query(coll, ...filters);
  const pageConstraints: QueryConstraint[] = [
    ...filters,
    orderBy(orderCfg.field, orderCfg.direction),
    ...(params.cursor ? [startAfter(params.cursor)] : []),
    limit(params.pageSize + 1),
  ];

  try {
    const [countSnap, docsSnap] = await Promise.all([
      getCountFromServer(countQuery),
      getDocs(query(coll, ...pageConstraints)),
    ]);

    const hasMore = docsSnap.docs.length > params.pageSize;
    const pageDocs = hasMore ? docsSnap.docs.slice(0, params.pageSize) : docsSnap.docs;

    return {
      items: pageDocs.map((d) => mapCadastroDoc(d.id, d.data())),
      nextCursor: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
      hasMore,
      totalMatching: countSnap.data().count,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('requires an index') || msg.includes('failed-precondition')) {
      const fallbackSnap = await getDocs(query(coll, orderBy('criadoEm', 'desc')));
      const allMapped = fallbackSnap.docs.map((d) => mapCadastroDoc(d.id, d.data()));
      const filtered = filterAndSortRegistrations(allMapped, {
        status: params.status,
        roles: params.role ? [params.role] : undefined,
        maritalStatus: params.maritalStatus,
        unseenOnly: params.unseenOnly,
        sort: params.sort,
      });
      const targetPage = Math.max(1, params.page ?? 1);
      const startIdx = (targetPage - 1) * params.pageSize;
      return {
        items: filtered.slice(startIdx, startIdx + params.pageSize),
        nextCursor: null,
        hasMore: startIdx + params.pageSize < filtered.length,
        totalMatching: filtered.length,
      };
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchFilteredCadastrosFromFirestore(
  criteria: FilterCriteria
): Promise<ContractorRegistrationDetail[]> {
  const path = 'cadastros';
  try {
    const snap = await getDocs(query(collection(db, path), orderBy('criadoEm', 'desc')));
    const records = snap.docs.map((d) => mapCadastroDoc(d.id, d.data()));
    return filterAndSortRegistrations(records, criteria);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getCadastroById(
  cadastroId: string
): Promise<ContractorRegistrationDetail | null> {
  const path = `cadastros/${cadastroId}`;
  try {
    const snap = await getDoc(doc(db, 'cadastros', cadastroId));
    if (!snap.exists()) return null;
    return mapCadastroDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function markCadastroViewed(
  cadastroId: string,
  alreadyViewed: boolean,
  actor: PanelUserProfile
): Promise<void> {
  const path = `cadastros/${cadastroId}`;
  try {
    if (!alreadyViewed) {
      await updateDoc(doc(db, 'cadastros', cadastroId), {
        visto: true,
        vistoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }
    await recordAuditLog({
      acao: 'ABRIU_CADASTRO',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: {
        resumo: alreadyViewed ? 'Reabriu ficha cadastral' : 'Primeiro acesso à ficha cadastral',
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markCadastroUnseen(
  cadastroId: string,
  actor: PanelUserProfile
): Promise<void> {
  const path = `cadastros/${cadastroId}`;
  try {
    await updateDoc(doc(db, 'cadastros', cadastroId), {
      visto: false,
      vistoEm: null,
      atualizadoEm: serverTimestamp(),
    });
    await recordAuditLog({
      acao: 'EDITOU_CADASTRO',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: { resumo: 'Marcado como não visto' },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCadastroStatus(
  cadastroId: string,
  previousStatus: RegistrationStatus,
  nextStatus: RegistrationStatus,
  actor: PanelUserProfile
): Promise<void> {
  const path = `cadastros/${cadastroId}`;
  try {
    await updateDoc(doc(db, 'cadastros', cadastroId), {
      status: nextStatus,
      atualizadoEm: serverTimestamp(),
    });
    await recordAuditLog({
      acao: 'ALTEROU_STATUS',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: {
        statusAnterior: previousStatus,
        statusNovo: nextStatus,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCadastroNotes(
  cadastroId: string,
  internalNotes: string,
  actor: PanelUserProfile
): Promise<void> {
  const path = `cadastros/${cadastroId}`;
  try {
    await updateDoc(doc(db, 'cadastros', cadastroId), {
      observacoes: internalNotes.slice(0, 4000),
      atualizadoEm: serverTimestamp(),
    });
    await recordAuditLog({
      acao: 'SALVOU_OBSERVACOES',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: { resumo: 'Atualizou observações internas' },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCadastroFull(
  cadastroId: string,
  rawInput: ContractorRegistrationInput,
  actor: PanelUserProfile
): Promise<void> {
  const normalized = normalizeCadastroPayload(rawInput);
  const path = `cadastros/${cadastroId}`;
  const cadastroRef = doc(db, 'cadastros', cadastroId);

  try {
    const currentSnap = await getDoc(cadastroRef);
    const currentData = currentSnap.exists() ? currentSnap.data() : null;
    const oldCpfDigitos = currentData ? onlyDigits(String(currentData.cpf || '')) : '';
    const oldCnpjDigitos = currentData ? onlyDigits(String(currentData.cnpj || '')) : '';

    const cpfChanged = oldCpfDigitos !== normalized.cpfDigitos;
    const cnpjChanged = oldCnpjDigitos !== normalized.cnpjDigitos;

    const newCpfLockRef = doc(db, 'cadastros_chaves', `cpf_${normalized.cpfDigitos}`);
    const newCnpjLockRef = doc(db, 'cadastros_chaves', `cnpj_${normalized.cnpjDigitos}`);

    if (cpfChanged) {
      const existingCpfLock = await getDoc(newCpfLockRef);
      if (existingCpfLock.exists() && existingCpfLock.data()?.cadastroId !== cadastroId) {
        throw new Error('Já existe outro cadastro registrado com este CPF.');
      }
    }
    if (cnpjChanged) {
      const existingCnpjLock = await getDoc(newCnpjLockRef);
      if (existingCnpjLock.exists() && existingCnpjLock.data()?.cadastroId !== cadastroId) {
        throw new Error('Já existe outro cadastro registrado com este CNPJ.');
      }
    }

    const batch = writeBatch(db);
    batch.update(cadastroRef, {
      ...normalized,
      atualizadoEm: serverTimestamp(),
    });

    if (cpfChanged) {
      if (oldCpfDigitos.length === 11) {
        batch.delete(doc(db, 'cadastros_chaves', `cpf_${oldCpfDigitos}`));
      }
      batch.set(newCpfLockRef, {
        tipo: 'cpf',
        valorDigitos: normalized.cpfDigitos,
        cadastroId,
        criadoEm: serverTimestamp(),
      });
    }

    if (cnpjChanged) {
      if (oldCnpjDigitos.length === 14) {
        batch.delete(doc(db, 'cadastros_chaves', `cnpj_${oldCnpjDigitos}`));
      }
      batch.set(newCnpjLockRef, {
        tipo: 'cnpj',
        valorDigitos: normalized.cnpjDigitos,
        cadastroId,
        criadoEm: serverTimestamp(),
      });
    }

    await batch.commit();

    await recordAuditLog({
      acao: 'EDITOU_CADASTRO',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: { resumo: `Editou dados cadastrais de ${normalized.nomeCompleto}` },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Já existe outro cadastro registrado')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCadastroWithCascade(
  cadastroId: string,
  fullName: string,
  actor: PanelUserProfile
): Promise<void> {
  const path = `cadastros/${cadastroId}`;
  try {
    const cadastroRef = doc(db, 'cadastros', cadastroId);
    const [cadastroSnap, termosSnap, docsSnap] = await Promise.all([
      getDoc(cadastroRef),
      getDocs(query(collection(db, 'termos'), where('cadastroId', '==', cadastroId))),
      getDocs(collection(db, 'cadastros', cadastroId, 'documentos')),
    ]);

    const batch = writeBatch(db);
    for (const termoDoc of termosSnap.docs) {
      batch.delete(termoDoc.ref);
    }
    for (const anexoDoc of docsSnap.docs) {
      batch.delete(anexoDoc.ref);
    }

    if (cadastroSnap.exists()) {
      const data = cadastroSnap.data();
      const cpfDigitos = onlyDigits(String(data.cpfDigitos || data.cpf || ''));
      const cnpjDigitos = onlyDigits(String(data.cnpjDigitos || data.cnpj || ''));
      if (cpfDigitos.length === 11) {
        batch.delete(doc(db, 'cadastros_chaves', `cpf_${cpfDigitos}`));
      }
      if (cnpjDigitos.length === 14) {
        batch.delete(doc(db, 'cadastros_chaves', `cnpj_${cnpjDigitos}`));
      }
    }

    batch.delete(cadastroRef);
    await batch.commit();

    await recordAuditLog({
      acao: 'EXCLUIU_CADASTRO',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: { resumo: `Excluiu cadastro de ${fullName}` },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== DOCUMENTOS OPCIONAIS ANEXADOS (RG, CNH, MEI) ====================

export function subscribeToDocumentosByCadastro(
  cadastroId: string,
  onData: (items: RegistrationDocumentAttachment[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = `cadastros/${cadastroId}/documentos`;
  const q = collection(db, 'cadastros', cadastroId, 'documentos');

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapDocumentoDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertCadastroDocumento(params: {
  cadastroId: string;
  attachment: RegistrationDocumentAttachmentInput;
  alreadyExists: boolean;
  actor: PanelUserProfile;
}): Promise<void> {
  const parsed = registrationDocumentAttachmentSchema.parse(params.attachment);
  const path = `cadastros/${params.cadastroId}/documentos/${parsed.tipo}`;
  const docRef = doc(db, 'cadastros', params.cadastroId, 'documentos', parsed.tipo);

  try {
    if (params.alreadyExists) {
      await updateDoc(docRef, {
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        tamanhoBytes: parsed.tamanhoBytes,
        conteudoBase64: parsed.conteudoBase64,
        atualizadoEm: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        tipo: parsed.tipo,
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        tamanhoBytes: parsed.tamanhoBytes,
        conteudoBase64: parsed.conteudoBase64,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }

    await recordAuditLog({
      acao: 'ANEXOU_DOCUMENTO',
      entidade: 'cadastros',
      entidadeId: params.cadastroId,
      cadastroId: params.cadastroId,
      actor: params.actor,
      detalhes: {
        resumo: `${params.alreadyExists ? 'Substituiu' : 'Anexou'} documento (${parsed.tipo}): ${parsed.nomeArquivo}`,
      },
    });
  } catch (error) {
    handleFirestoreError(
      error,
      params.alreadyExists ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteCadastroDocumento(params: {
  cadastroId: string;
  tipo: RegistrationDocumentType;
  fileName: string;
  actor: PanelUserProfile;
}): Promise<void> {
  const path = `cadastros/${params.cadastroId}/documentos/${params.tipo}`;
  try {
    await deleteDoc(doc(db, 'cadastros', params.cadastroId, 'documentos', params.tipo));
    await recordAuditLog({
      acao: 'EXCLUIU_DOCUMENTO',
      entidade: 'cadastros',
      entidadeId: params.cadastroId,
      cadastroId: params.cadastroId,
      actor: params.actor,
      detalhes: {
        resumo: `Excluiu documento (${params.tipo}): ${params.fileName}`,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== TERMOS DE AUTORIZAÇÃO DE DESCONTO ====================

export function subscribeToTermosByCadastro(
  cadastroId: string,
  onData: (items: DiscountTermHistoryItem[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'termos';
  const q = query(
    collection(db, path),
    where('cadastroId', '==', cadastroId),
    orderBy('criadoEm', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapTermoDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function getLatestTermDocumentsByCadastro(
  cadastroId: string
): Promise<string[]> {
  const path = 'termos';
  try {
    const q = query(
      collection(db, path),
      where('cadastroId', '==', cadastroId),
      orderBy('criadoEm', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const data = snap.docs[0].data();
    return Array.isArray(data.documentosSelecionados)
      ? data.documentosSelecionados.map((item) => String(item))
      : [];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createTermoWithAudit(params: {
  cadastroId: string;
  input: DiscountTermGenerateInput;
  actor: PanelUserProfile;
}): Promise<DiscountTermHistoryItem> {
  const path = 'termos';
  const termoRef = doc(collection(db, path));
  const nowIso = new Date().toISOString();
  const cleanDocuments = params.input.selectedDocuments
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (cleanDocuments.length === 0) {
    throw new Error('Selecione pelo menos um documento para gerar o termo.');
  }

  const auditResumo = `Documentos (${cleanDocuments.length}): ${cleanDocuments.join('; ')}`.slice(
    0,
    400
  );

  try {
    await setDoc(termoRef, {
      cadastroId: params.cadastroId,
      razaoSocialContratada: params.input.contractorCompanyName,
      cnpjContratada: params.input.contractorCnpj,
      valorTotal: params.input.totalValueDisplay,
      formaAbatimento: params.input.paymentMode,
      numParcelas: params.input.installmentsCount,
      valorParcela: params.input.installmentValueDisplay,
      mesAnoInicio: params.input.startMonthYear,
      localData: params.input.localDate,
      documentosSelecionados: cleanDocuments,
      camposTemplate: params.input.templateFields,
      formatoInicial: params.input.requestedFormat,
      geradoPorUid: params.actor.uid,
      geradoPorNome: params.actor.nome,
      geradoPorEmail: params.actor.email,
      criadoEm: serverTimestamp(),
    });

    await recordAuditLog({
      acao:
        params.input.requestedFormat === 'docx'
          ? 'GEROU_TERMO_DOCX'
          : 'GEROU_TERMO_PDF',
      entidade: 'termos',
      entidadeId: termoRef.id,
      cadastroId: params.cadastroId,
      actor: params.actor,
      detalhes: {
        termoId: termoRef.id,
        formato: params.input.requestedFormat.toUpperCase(),
        valorTotal: params.input.totalValueDisplay || 'Em branco',
        formaAbatimento: params.input.paymentMode,
        razaoSocial: params.input.contractorCompanyName || 'Em branco',
        resumo: auditResumo,
      },
    });

    return {
      id: termoRef.id,
      registrationId: params.cadastroId,
      contractorCompanyName: params.input.contractorCompanyName,
      contractorCnpj: params.input.contractorCnpj,
      totalValueDisplay: params.input.totalValueDisplay,
      paymentMode: params.input.paymentMode,
      installmentsCount: params.input.installmentsCount,
      installmentValueDisplay: params.input.installmentValueDisplay,
      startMonthYear: params.input.startMonthYear,
      localDate: params.input.localDate,
      selectedDocuments: cleanDocuments,
      templateFields: params.input.templateFields,
      generatedByUserId: params.actor.uid,
      generatedByName: params.actor.nome,
      generatedByEmail: params.actor.email,
      createdAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordTermRedownloadAudit(params: {
  cadastroId: string;
  termoId: string;
  format: 'docx' | 'pdf';
  actor: PanelUserProfile;
}): Promise<void> {
  await recordAuditLog({
    acao: params.format === 'docx' ? 'REBAIXOU_TERMO_DOCX' : 'REBAIXOU_TERMO_PDF',
    entidade: 'termos',
    entidadeId: params.termoId,
    cadastroId: params.cadastroId,
    actor: params.actor,
    detalhes: {
      termoId: params.termoId,
      formato: params.format.toUpperCase(),
    },
  });
}

// ==================== AUDITORIA (SOMENTE ADMINISTRADOR LÊ) ====================

export function subscribeToAuditoriaByCadastro(
  cadastroId: string,
  onData: (items: AuditLogItem[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'auditoria';
  const q = query(
    collection(db, path),
    where('cadastroId', '==', cadastroId),
    orderBy('criadoEm', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapAuditoriaDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToAllTermos(
  onData: (items: DiscountTermHistoryItem[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'termos';
  const q = query(collection(db, path), orderBy('criadoEm', 'desc'), limit(300));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapTermoDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToAllAuditoria(
  onData: (items: AuditLogItem[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'auditoria';
  const q = query(collection(db, path), orderBy('criadoEm', 'desc'), limit(250));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapAuditoriaDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

// ==================== USUÁRIOS / EQUIPE (SOMENTE ADMINISTRADOR) ====================

export function subscribeToPanelUsers(
  onData: (users: PanelUserProfile[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = 'usuarios';
  const q = query(collection(db, path), orderBy('nome', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapUsuarioDoc(d.id, d.data())));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createPanelUser(params: {
  nome: string;
  email: string;
  role: PanelUserRole;
  initialPassword?: string;
  actor: PanelUserProfile;
}): Promise<PanelUserProfile & { passwordSetupEmailSent: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanNome = params.nome.trim();

  const { uid, passwordSetupEmailSent } = await createSecondaryAuthUserAndSendPasswordSetup(
    cleanEmail,
    params.initialPassword
  );
  const path = `usuarios/${uid}`;

  try {
    await setDoc(doc(db, 'usuarios', uid), {
      nome: cleanNome,
      email: cleanEmail,
      role: params.role,
      ativo: true,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    await recordAuditLog({
      acao: 'CRIOU_USUARIO',
      entidade: 'usuarios',
      entidadeId: uid,
      actor: params.actor,
      detalhes: {
        resumo: passwordSetupEmailSent
          ? `Criou acesso ${params.role} para ${cleanNome} (${cleanEmail}) e enviou e-mail de definição de senha`
          : `Criou acesso ${params.role} para ${cleanNome} (${cleanEmail}) com senha inicial definida pelo administrador`,
      },
    });

    const nowIso = new Date().toISOString();
    return {
      uid,
      nome: cleanNome,
      email: cleanEmail,
      role: params.role,
      ativo: true,
      criadoEm: nowIso,
      atualizadoEm: nowIso,
      passwordSetupEmailSent,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resendUserPasswordSetupEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function updatePanelUser(params: {
  targetUid: string;
  nome: string;
  email: string;
  role: PanelUserRole;
  ativo: boolean;
  actor: PanelUserProfile;
}): Promise<void> {
  const path = `usuarios/${params.targetUid}`;
  try {
    await updateDoc(doc(db, 'usuarios', params.targetUid), {
      nome: params.nome.trim(),
      email: params.email.trim().toLowerCase(),
      role: params.role,
      ativo: params.ativo,
      atualizadoEm: serverTimestamp(),
    });

    await recordAuditLog({
      acao: 'ATUALIZOU_USUARIO',
      entidade: 'usuarios',
      entidadeId: params.targetUid,
      actor: params.actor,
      detalhes: {
        resumo: `Atualizou acesso de ${params.nome.trim()} (${params.role}, ${params.ativo ? 'ativo' : 'inativo'})`,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removePanelUser(params: {
  targetUid: string;
  targetName: string;
  targetEmail: string;
  actor: PanelUserProfile;
}): Promise<void> {
  const path = `usuarios/${params.targetUid}`;
  try {
    await deleteDoc(doc(db, 'usuarios', params.targetUid));
    await recordAuditLog({
      acao: 'REMOVEU_USUARIO',
      entidade: 'usuarios',
      entidadeId: params.targetUid,
      actor: params.actor,
      detalhes: {
        resumo: `Removeu acesso de ${params.targetName} (${params.targetEmail})`,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== CONSULTA PÚBLICA BRASILAPI (NAVEGADOR) ====================

export async function lookupCnpjBrasilApiClient(rawCnpj: string): Promise<{
  found: boolean;
  razaoSocial: string;
  nomeFantasia?: string;
}> {
  const digits = onlyDigits(rawCnpj);
  if (digits.length !== 14) {
    return { found: false, razaoSocial: '' };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { found: false, razaoSocial: '' };
    }

    const data = (await response.json()) as {
      razao_social?: string;
      nome_fantasia?: string;
    };

    const razaoSocial = typeof data.razao_social === 'string' ? data.razao_social.trim() : '';
    const nomeFantasia = typeof data.nome_fantasia === 'string' ? data.nome_fantasia.trim() : '';

    if (!razaoSocial && !nomeFantasia) {
      return { found: false, razaoSocial: '' };
    }

    return {
      found: true,
      razaoSocial: razaoSocial || nomeFantasia,
      nomeFantasia,
    };
  } catch {
    return { found: false, razaoSocial: '' };
  } finally {
    window.clearTimeout(timer);
  }
}
