import { config } from '../config/env.js';
import { createFileStore } from './fileStore.js';
import { createMongoStore } from './mongoStore.js';
let store = null;
export async function initStore() {
 if (store) return store;
 if (config.mongo.enabled) {
  try { store = await createMongoStore(config.mongo); }
  catch (error) { if (config.nodeEnv === 'production') throw new Error(`Production database unavailable; refusing unsafe file-store fallback: ${error.message}`); console.warn(`[store] MongoDB unreachable (${error.message}); using local file store for development only.`); }
 } else if (config.nodeEnv === 'production') throw new Error('MONGODB_URI is required in production. Local JSON storage is not supported for production data.');
 store ??= await createFileStore({ dataDir: config.dataDir }); return store;
}
const lazy = (name) => { const handle = () => { if (!store) throw new Error('Store accessed before initStore()'); return store.collection(name); }; return new Proxy({}, { get: (_target, method) => (...args) => handle()[method](...args) }); };
export const users = lazy('users'); export const roles = lazy('roles'); export const candidates = lazy('candidates'); export const interviews = lazy('interviews'); export const knowledgeDocs = lazy('knowledgeDocs'); export const auditEvents = lazy('auditEvents');
export const storeKind = () => store?.kind ?? 'uninitialised'; export const closeStore = () => store?.close();
