import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-ameta-rules';
const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');

function parseEmulatorHost(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  const [host, portStr] = raw.split(':');
  return {
    host: host || '127.0.0.1',
    port: Number(portStr) || 8080,
  };
}

function makeValidCadastroPayload(overrides: Record<string, unknown> = {}) {
  const fullName = String(overrides.nomeCompleto ?? 'João Pedro Almeida');
  const cpf = String(overrides.cpf ?? '123.456.789-01');
  const cnpj = String(overrides.cnpj ?? '12.345.678/0001-90');
  const cep = String(overrides.cepEmpresa ?? '01310-100');
  const phone = String(overrides.telefone ?? '(11) 98765-4321');

  return {
    dataCadastro: '2026-11-18',
    funcao: 'Técnico de Instalação',
    nomeCompleto: fullName,
    nomeCompletoLower: fullName.toLowerCase(),
    cpf,
    cpfDigitos: cpf.replace(/\D/g, ''),
    rg: '12.345.678-9',
    naturalidade: 'São Paulo',
    nacionalidade: 'Brasileira',
    estadoCivil: 'Solteiro(a)',
    dataNascimento: '1992-05-14',
    cnpj,
    cnpjDigitos: cnpj.replace(/\D/g, ''),
    enderecoEmpresa: 'Av. Paulista, 1000, Conjunto 42 - São Paulo/SP',
    cepEmpresa: cep,
    cepDigitos: cep.replace(/\D/g, ''),
    nomePai: 'Carlos Almeida',
    nomeMae: 'Maria José Almeida',
    email: 'joao.almeida@empresa.com.br',
    telefone: phone,
    telefoneDigitos: phone.replace(/\D/g, ''),
    status: 'Novo',
    observacoes: '',
    visto: false,
    vistoEm: null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    ...overrides,
  };
}

let testEnv: RulesTestEnvironment;

before(async () => {
  const { host, port } = parseEmulatorHost();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host,
      port,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();

    await setDoc(doc(db, 'usuarios', 'admin-uid'), {
      nome: 'Administrador Ameta',
      email: 'admin@ameta.com.br',
      role: 'admin',
      ativo: true,
      criadoEm: now,
      atualizadoEm: now,
    });

    await setDoc(doc(db, 'usuarios', 'operador-uid'), {
      nome: 'Operador Ameta',
      email: 'operador@ameta.com.br',
      role: 'operador',
      ativo: true,
      criadoEm: now,
      atualizadoEm: now,
    });

    await setDoc(doc(db, 'usuarios', 'inativo-uid'), {
      nome: 'Ex-Colaborador',
      email: 'inativo@ameta.com.br',
      role: 'operador',
      ativo: false,
      criadoEm: now,
      atualizadoEm: now,
    });

    await setDoc(doc(db, 'cadastros', 'cad-existente-1'), {
      ...makeValidCadastroPayload(),
      criadoEm: now,
      atualizadoEm: now,
    });

    await setDoc(doc(db, 'cadastros_chaves', 'cpf_12345678901'), {
      tipo: 'cpf',
      valorDigitos: '12345678901',
      cadastroId: 'cad-existente-1',
      criadoEm: now,
    });

    await setDoc(doc(db, 'cadastros_chaves', 'cnpj_12345678000190'), {
      tipo: 'cnpj',
      valorDigitos: '12345678000190',
      cadastroId: 'cad-existente-1',
      criadoEm: now,
    });

    await setDoc(doc(db, 'auditoria', 'audit-existente-1'), {
      acao: 'LOGIN',
      entidade: 'sessao',
      entidadeId: 'admin-uid',
      cadastroId: '',
      uid: 'admin-uid',
      nome: 'Administrador Ameta',
      email: 'admin@ameta.com.br',
      detalhes: { resumo: 'Login realizado' },
      criadoEm: now,
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('Firestore Security Rules — Ameta Prestadores', () => {
  it('1. Visitante sem login cria cadastro válido com exatamente os 16 campos e chaves de unicidade -> PERMITIDO', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const payload = makeValidCadastroPayload({
      cpf: '390.533.447-05',
      cnpj: '11.222.333/0001-81',
    });
    const batch = writeBatch(anonDb);
    batch.set(doc(anonDb, 'cadastros', 'cad-publico-ok'), payload);
    batch.set(doc(anonDb, 'cadastros_chaves', 'cpf_39053344705'), {
      tipo: 'cpf',
      valorDigitos: '39053344705',
      cadastroId: 'cad-publico-ok',
      criadoEm: serverTimestamp(),
    });
    batch.set(doc(anonDb, 'cadastros_chaves', 'cnpj_11222333000181'), {
      tipo: 'cnpj',
      valorDigitos: '11222333000181',
      cadastroId: 'cad-publico-ok',
      criadoEm: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it('2. Visitante sem login com campo extra, campo faltando, função inválida ou status != "Novo" -> NEGADO', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();

    // Campo extra
    await assertFails(
      setDoc(
        doc(anonDb, 'cadastros', 'cad-campo-extra'),
        makeValidCadastroPayload({ campoExtra: 'indevido' })
      )
    );

    // Campo faltando
    const semTelefone = makeValidCadastroPayload();
    delete (semTelefone as Record<string, unknown>).telefone;
    await assertFails(setDoc(doc(anonDb, 'cadastros', 'cad-campo-faltando'), semTelefone));

    // Função inválida (fora das 3 opções fixas)
    await assertFails(
      setDoc(
        doc(anonDb, 'cadastros', 'cad-funcao-invalida'),
        makeValidCadastroPayload({ funcao: 'Gerente Geral' })
      )
    );

    // Status inicial diferente de "Novo"
    await assertFails(
      setDoc(
        doc(anonDb, 'cadastros', 'cad-status-invalido'),
        makeValidCadastroPayload({ status: 'Concluído' })
      )
    );

    // visto inicial diferente de false
    await assertFails(
      setDoc(
        doc(anonDb, 'cadastros', 'cad-visto-invalido'),
        makeValidCadastroPayload({ visto: true })
      )
    );
  });

  it('3. Visitante sem login lê, lista, edita ou exclui qualquer cadastro -> NEGADO', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const existingRef = doc(anonDb, 'cadastros', 'cad-existente-1');

    await assertFails(getDoc(existingRef));
    await assertFails(getDocs(collection(anonDb, 'cadastros')));
    await assertFails(
      updateDoc(existingRef, {
        status: 'Concluído',
        atualizadoEm: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(existingRef));
  });

  it('4. Usuário autenticado no Auth mas SEM documento em usuarios/{uid} lê cadastros -> NEGADO', async () => {
    const intrusoDb = testEnv
      .authenticatedContext('sem-perfil-uid', { email: 'intruso@gmail.com' })
      .firestore();

    await assertFails(getDoc(doc(intrusoDb, 'cadastros', 'cad-existente-1')));
    await assertFails(getDocs(collection(intrusoDb, 'cadastros')));
  });

  it('5. Usuário autenticado com ativo == false lê cadastros -> NEGADO', async () => {
    const inativoDb = testEnv
      .authenticatedContext('inativo-uid', { email: 'inativo@ameta.com.br' })
      .firestore();

    await assertFails(getDoc(doc(inativoDb, 'cadastros', 'cad-existente-1')));
    await assertFails(getDocs(collection(inativoDb, 'cadastros')));
  });

  it('6. Operador lê e atualiza status/observacoes -> PERMITIDO; alterar nome/CPF, excluir cadastro ou escrever em usuarios -> NEGADO', async () => {
    const operadorDb = testEnv
      .authenticatedContext('operador-uid', { email: 'operador@ameta.com.br' })
      .firestore();
    const cadRef = doc(operadorDb, 'cadastros', 'cad-existente-1');

    // Leitura e atualização de status/observações/visto permitidas
    const snap = await assertSucceeds(getDoc(cadRef));
    assert.equal(snap.exists(), true);

    await assertSucceeds(
      updateDoc(cadRef, {
        status: 'Em análise',
        observacoes: 'Documentação conferida pela equipe.',
        visto: true,
        vistoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
    );

    // Operador NÃO pode alterar nomeCompleto ou CPF
    await assertFails(
      updateDoc(cadRef, {
        nomeCompleto: 'Nome Alterado Indevidamente',
        atualizadoEm: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(cadRef, {
        cpf: '987.654.321-00',
        atualizadoEm: serverTimestamp(),
      })
    );

    // Operador NÃO pode excluir cadastro
    await assertFails(deleteDoc(cadRef));

    // Operador NÃO pode ler lista de usuários nem criar/editar usuários
    await assertFails(getDocs(collection(operadorDb, 'usuarios')));
    await assertFails(
      setDoc(doc(operadorDb, 'usuarios', 'novo-operador-uid'), {
        nome: 'Novo Usuário',
        email: 'novo@ameta.com.br',
        role: 'operador',
        ativo: true,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
    );
  });

  it('7. Admin exclui cadastro e gerencia usuarios -> PERMITIDO (com bloqueio de auto-desativação/auto-exclusão)', async () => {
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { email: 'admin@ameta.com.br' })
      .firestore();

    // Admin cria e atualiza outro usuário em /usuarios
    const novoUsuarioRef = doc(adminDb, 'usuarios', 'novo-tecnico-painel');
    await assertSucceeds(
      setDoc(novoUsuarioRef, {
        nome: 'Carla Operadora',
        email: 'carla@ameta.com.br',
        role: 'operador',
        ativo: true,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(novoUsuarioRef, {
        ativo: false,
        atualizadoEm: serverTimestamp(),
      })
    );
    await assertSucceeds(getDocs(collection(adminDb, 'usuarios')));

    // Admin NÃO pode desativar ou remover o próprio acesso
    const selfRef = doc(adminDb, 'usuarios', 'admin-uid');
    await assertFails(
      updateDoc(selfRef, {
        ativo: false,
        atualizadoEm: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(selfRef));

    // Admin exclui cadastro existente
    await assertSucceeds(deleteDoc(doc(adminDb, 'cadastros', 'cad-existente-1')));
  });

  it('8. Ninguém pode editar ou excluir registro de auditoria -> NEGADO', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const operadorDb = testEnv
      .authenticatedContext('operador-uid', { email: 'operador@ameta.com.br' })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { email: 'admin@ameta.com.br' })
      .firestore();

    const auditAnonRef = doc(anonDb, 'auditoria', 'audit-existente-1');
    const auditOpRef = doc(operadorDb, 'auditoria', 'audit-existente-1');
    const auditAdminRef = doc(adminDb, 'auditoria', 'audit-existente-1');

    // Operador cria auditoria própria (permitido), mas não pode ler nem editar/excluir
    await assertSucceeds(
      setDoc(doc(operadorDb, 'auditoria', 'audit-op-1'), {
        acao: 'ABRIU_CADASTRO',
        entidade: 'cadastros',
        entidadeId: 'cad-existente-1',
        cadastroId: 'cad-existente-1',
        uid: 'operador-uid',
        nome: 'Operador Ameta',
        email: 'operador@ameta.com.br',
        detalhes: { resumo: 'Visualização' },
        criadoEm: serverTimestamp(),
      })
    );
    await assertFails(getDoc(auditOpRef));

    // Admin lê auditoria, mas NINGUÉM pode editar ou excluir
    await assertSucceeds(getDoc(auditAdminRef));

    await assertFails(updateDoc(auditAnonRef, { nome: 'Adulterado' }));
    await assertFails(updateDoc(auditOpRef, { nome: 'Adulterado' }));
    await assertFails(updateDoc(auditAdminRef, { nome: 'Adulterado' }));

    await assertFails(deleteDoc(auditAnonRef));
    await assertFails(deleteDoc(auditOpRef));
    await assertFails(deleteDoc(auditAdminRef));
  });

  it('9. Documentos opcionais (RG, CNH, MEI): criação atômica pública permitida, leitura anônima e anexo tardio negados', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const operadorDb = testEnv
      .authenticatedContext('operador-uid', { email: 'operador@ameta.com.br' })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { email: 'admin@ameta.com.br' })
      .firestore();

    const validAttachment = (tipo: 'rg' | 'cnh' | 'certificado_mei') => ({
      tipo,
      nomeArquivo: `${tipo}.pdf`,
      mimeType: 'application/pdf',
      tamanhoBytes: 128,
      conteudoBase64: 'JVBERi0xLjQK',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    // Criação atômica de cadastro + chaves únicas + documentos opcionais por visitante anônimo -> PERMITIDO
    const payloadComAnexos = makeValidCadastroPayload({
      cpf: '529.982.247-25',
      cnpj: '27.865.757/0001-02',
    });
    const batch = writeBatch(anonDb);
    batch.set(doc(anonDb, 'cadastros', 'cad-com-anexos'), payloadComAnexos);
    batch.set(doc(anonDb, 'cadastros_chaves', 'cpf_52998224725'), {
      tipo: 'cpf',
      valorDigitos: '52998224725',
      cadastroId: 'cad-com-anexos',
      criadoEm: serverTimestamp(),
    });
    batch.set(doc(anonDb, 'cadastros_chaves', 'cnpj_27865757000102'), {
      tipo: 'cnpj',
      valorDigitos: '27865757000102',
      cadastroId: 'cad-com-anexos',
      criadoEm: serverTimestamp(),
    });
    batch.set(doc(anonDb, 'cadastros', 'cad-com-anexos', 'documentos', 'rg'), validAttachment('rg'));
    batch.set(
      doc(anonDb, 'cadastros', 'cad-com-anexos', 'documentos', 'certificado_mei'),
      validAttachment('certificado_mei')
    );
    await assertSucceeds(batch.commit());

    // Visitante anônimo NÃO pode anexar documento a um cadastro já existente
    await assertFails(
      setDoc(doc(anonDb, 'cadastros', 'cad-existente-1', 'documentos', 'cnh'), validAttachment('cnh'))
    );

    // Visitante anônimo NÃO pode ler ou listar documentos
    await assertFails(getDoc(doc(anonDb, 'cadastros', 'cad-com-anexos', 'documentos', 'rg')));
    await assertFails(getDocs(collection(anonDb, 'cadastros', 'cad-com-anexos', 'documentos')));

    // Operador pode ler e anexar/atualizar documento, mas NÃO pode excluir
    await assertSucceeds(getDocs(collection(operadorDb, 'cadastros', 'cad-com-anexos', 'documentos')));
    await assertSucceeds(
      setDoc(
        doc(operadorDb, 'cadastros', 'cad-com-anexos', 'documentos', 'cnh'),
        validAttachment('cnh')
      )
    );
    await assertFails(deleteDoc(doc(operadorDb, 'cadastros', 'cad-com-anexos', 'documentos', 'rg')));

    // Admin pode excluir documento
    await assertSucceeds(deleteDoc(doc(adminDb, 'cadastros', 'cad-com-anexos', 'documentos', 'rg')));
  });

  it('10. Chaves únicas (cadastros_chaves): bloqueia duplicidade de CPF/CNPJ e impede leitura/alteração pública', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { email: 'admin@ameta.com.br' })
      .firestore();

    // Visitante não pode ler nem listar cadastros_chaves
    await assertFails(getDoc(doc(anonDb, 'cadastros_chaves', 'cpf_12345678901')));
    await assertFails(getDocs(collection(anonDb, 'cadastros_chaves')));

    // Tentativa de cadastrar outro prestador com mesmo CPF já existente -> NEGADO
    const dupBatch = writeBatch(anonDb);
    dupBatch.set(
      doc(anonDb, 'cadastros', 'cad-duplicado'),
      makeValidCadastroPayload({ cnpj: '33.444.555/0001-66' })
    );
    dupBatch.set(doc(anonDb, 'cadastros_chaves', 'cpf_12345678901'), {
      tipo: 'cpf',
      valorDigitos: '12345678901',
      cadastroId: 'cad-duplicado',
      criadoEm: serverTimestamp(),
    });
    dupBatch.set(doc(anonDb, 'cadastros_chaves', 'cnpj_33444555000166'), {
      tipo: 'cnpj',
      valorDigitos: '33444555000166',
      cadastroId: 'cad-duplicado',
      criadoEm: serverTimestamp(),
    });
    await assertFails(dupBatch.commit());

    // Ninguém pode dar update em cadastros_chaves
    await assertFails(
      updateDoc(doc(adminDb, 'cadastros_chaves', 'cpf_12345678901'), {
        cadastroId: 'outro-id',
      })
    );
  });
});
