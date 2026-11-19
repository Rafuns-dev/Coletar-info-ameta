import { sendPasswordResetEmail, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  createSecondaryAuthUserAndSendPasswordSetup,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase.ts';
import type { RegistrationStatus } from '../shared/formConfig.ts';
import {
  contractorRegistrationSchema,
  type AuditAction,
  type AuditLogItem,
  type ContractorRegistrationDetail,
  type ContractorRegistrationInput,
  type DiscountTermGenerateInput,
  type DiscountTermHistoryItem,
  type DiscountTermTemplateFields,
  type PanelUserProfile,
  type PanelUserRole,
} from '../shared/schema.ts';
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
  return {
    dataCadastro: parsed.registrationDate.trim(),
    funcao: parsed.role.trim(),
    nomeCompleto: parsed.fullName.trim(),
    cpf: formatCPF(parsed.cpf),
    rg: parsed.rg.trim(),
    naturalidade: parsed.birthPlace.trim(),
    nacionalidade: parsed.nationality.trim(),
    estadoCivil: parsed.maritalStatus.trim(),
    dataNascimento: parsed.birthDate.trim(),
    cnpj: formatCNPJ(parsed.cnpj),
    enderecoEmpresa: parsed.companyAddress.trim(),
    cepEmpresa: formatCEP(parsed.companyCep),
    nomePai: parsed.fatherName.trim(),
    nomeMae: parsed.motherName.trim(),
    email: parsed.email.trim().toLowerCase(),
    telefone: formatPhone(parsed.phone),
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

export function extractFriendlyFirestoreMessage(
  err: unknown,
  fallback = 'Não foi possível concluir a operação.'
): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('permission')) {
        return 'Acesso não autorizado ou permissão negada pelo Firestore.';
      }
      if (parsed.error.toLowerCase().includes('quota')) {
        return 'Cota diária do Firestore atingida. Tente novamente mais tarde.';
      }
      return parsed.error;
    }
  } catch {
    // mensagem comum
  }
  return err.message || fallback;
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

export async function submitPublicRegistration(
  rawInput: ContractorRegistrationInput
): Promise<string> {
  const normalized = normalizeCadastroPayload(rawInput);
  const path = 'cadastros';

  try {
    const ref = await addDoc(collection(db, path), {
      ...normalized,
      status: 'Novo',
      observacoes: '',
      visto: false,
      vistoEm: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ==================== AUTENTICAÇÃO E PERFIL DO PAINEL ====================

export async function resolvePanelUserProfile(
  firebaseUser: User
): Promise<PanelUserProfile | null> {
  const userPath = `usuarios/${firebaseUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
    if (!snap.exists()) {
      return null;
    }
    const profile = mapUsuarioDoc(snap.id, snap.data());
    return profile.ativo ? profile : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
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
  try {
    await updateDoc(doc(db, 'cadastros', cadastroId), {
      ...normalized,
      atualizadoEm: serverTimestamp(),
    });
    await recordAuditLog({
      acao: 'EDITOU_CADASTRO',
      entidade: 'cadastros',
      entidadeId: cadastroId,
      cadastroId,
      actor,
      detalhes: { resumo: `Editou dados cadastrais de ${normalized.nomeCompleto}` },
    });
  } catch (error) {
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
    const termosSnap = await getDocs(
      query(collection(db, 'termos'), where('cadastroId', '==', cadastroId))
    );

    const batch = writeBatch(db);
    for (const termoDoc of termosSnap.docs) {
      batch.delete(termoDoc.ref);
    }
    batch.delete(doc(db, 'cadastros', cadastroId));
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

export async function createTermoWithAudit(params: {
  cadastroId: string;
  input: DiscountTermGenerateInput;
  actor: PanelUserProfile;
}): Promise<DiscountTermHistoryItem> {
  const path = 'termos';
  const termoRef = doc(collection(db, path));
  const nowIso = new Date().toISOString();

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
