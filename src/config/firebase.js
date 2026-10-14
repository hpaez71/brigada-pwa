import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { firebaseConfig } from './firebaseConfig';

export const app = initializeApp(firebaseConfig);

// App Check: bloquea tráfico que no proviene de la app legítima.
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);

// Caché persistente en IndexedDB: lecturas offline y cola automática de escrituras
// que se sincroniza al recuperar la conexión.
let localCache;
try {
  localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
} catch {
  localCache = memoryLocalCache();
}
export const db = initializeFirestore(app, { localCache, ignoreUndefinedProperties: true });

export const storage = getStorage(app);
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1');
export const callable = (name) => httpsCallable(functions, name);

export const messagingPromise = isSupported()
  .then((ok) => (ok ? getMessaging(app) : null))
  .catch(() => null);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
