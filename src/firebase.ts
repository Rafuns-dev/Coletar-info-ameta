import { deleteApp, FirebaseError, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
} satisfies FirebaseOptions;

const databaseId =
  import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId || '(default)';

const recaptchaSiteKey =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || firebaseAppletConfig.recaptchaSiteKey || '';

export const app = getApps().length > 0 ? getApps()[0] : initializeApp(envConfig);

export const firebaseRuntimeConfig = {
  projectId: envConfig.projectId,
  databaseId,
  apiKey: envConfig.apiKey,
};

function createFirestoreInstance(): Firestore {
  const targetDbId = databaseId && databaseId !== '(default)' ? databaseId : undefined;
  return targetDbId ? getFirestore(app, targetDbId) : getFirestore(app);
}

export const db: Firestore = createFirestoreInstance();

export const auth: Auth = getAuth(app);

/**
 * Persistência restrita à aba/sessão do navegador (encerra ao fechar a aba),
 * com timeout de segurança para nunca travar o carregamento da tela de login.
 */
export const authPersistenceReady: Promise<void> =
  typeof window !== 'undefined'
    ? Promise.race([
        Promise.resolve()
          .then(() => setPersistence(auth, browserSessionPersistence))
          .catch((err) => {
            console.warn('Não foi possível configurar browserSessionPersistence:', err);
          }),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1500);
        }),
      ])
    : Promise.resolve();

if (typeof window !== 'undefined' && recaptchaSiteKey.trim()) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey.trim()),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('App Check não pôde ser inicializado neste ambiente:', err);
  }
}

export const isAppCheckConfigured = Boolean(recaptchaSiteKey.trim());

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    code: error instanceof FirebaseError ? error.code : undefined,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function isFirestoreRestReachable(): Promise<boolean> {
  if (
    typeof fetch !== 'function' ||
    !envConfig.projectId ||
    envConfig.projectId === 'remixed-project-id' ||
    !envConfig.apiKey
  ) {
    return false;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const dbName = databaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(envConfig.projectId)}/databases/${encodeURIComponent(dbName)}/documents/test/connection?key=${encodeURIComponent(envConfig.apiKey)}`;
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function testConnection(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      const restReachable = await isFirestoreRestReachable();
      if (restReachable) {
        console.warn(
          'Conexão WebChannel do Firestore demorou para responder, mas a API REST do projeto está acessível.'
        );
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      const retryReachable = await isFirestoreRestReachable();
      if (!retryReachable && navigator.onLine !== false) {
        console.error('Verifique sua configuração do Firebase (cliente offline).');
      }
    }
  }
}

void testConnection();

function generateRandomTempPassword(length = 28): string {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_=+';
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  let result = 'A1a!';
  for (let i = 0; i < bytes.length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Cria um novo usuário no Firebase Authentication usando uma segunda instância do Firebase App,
 * evitando desconectar o administrador logado na sessão principal. Pode enviar automaticamente
 * o e-mail de definição de senha ou utilizar uma senha inicial definida pelo administrador.
 */
export async function createSecondaryAuthUserAndSendPasswordSetup(
  email: string,
  initialPassword?: string
): Promise<{ uid: string; email: string; passwordSetupEmailSent: boolean }> {
  const secondaryAppName = `ameta-user-provisioner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(envConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    await setPersistence(secondaryAuth, browserSessionPersistence).catch(() => {});
    const useManualPassword = Boolean(initialPassword && initialPassword.length > 0);
    const passwordToUse = useManualPassword ? initialPassword! : generateRandomTempPassword();
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, passwordToUse);
    const uid = credential.user.uid;
    const createdEmail = credential.user.email || email;

    if (!useManualPassword) {
      await sendPasswordResetEmail(secondaryAuth, createdEmail);
    }
    await signOut(secondaryAuth);
    return {
      uid,
      email: createdEmail,
      passwordSetupEmailSent: !useManualPassword,
    };
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}
