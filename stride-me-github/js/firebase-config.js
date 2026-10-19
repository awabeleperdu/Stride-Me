// ==========================================================
// Firebase — initialisation (SDK modulaire via CDN, sans build)
// 1. Console Firebase → Paramètres du projet → Vos applications → Web
// 2. Remplace les valeurs ci-dessous.
// NB : ces clés web ne sont pas secrètes ; la sécurité vient des règles
// Firestore/Storage (voir firestore.rules.md) + domaines autorisés dans Auth.
// ==========================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

export const firebaseConfig = {
  apiKey: "AIzaSyAbDkyI73ZliBx8-O9qz75YFPKlR8rXrTA",
  authDomain: "ironlog-75f32.firebaseapp.com",
  projectId: "ironlog-75f32",
  storageBucket: "ironlog-75f32.firebasestorage.app",
  messagingSenderId: "937488676389",
  appId: "1:937488676389:web:b2890e70fbebf7ee5a71cc"
};

export const isConfigured = !firebaseConfig.apiKey.startsWith('REMPLACE');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Cache hors-ligne : économise les lectures (quota gratuit) et marche en salle sans réseau.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);
// Cloud Functions (administration : suppression / blocage de comptes). Région à garder identique dans functions/index.js.
export const functions = getFunctions(app, 'europe-west1');