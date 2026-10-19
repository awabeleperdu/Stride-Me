import { auth } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, linkWithPopup, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

let currentUser = null;
export const getUser = () => currentUser;

/**
 * Résout avec l'utilisateur déjà connecté (session mémorisée) ou null.
 * Firebase restaure la session tout seul si "Se souvenir de moi" était coché.
 */
export function initAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      currentUser = user || null;
      unsub();
      resolve(currentUser);
    }, reject);
  });
}

/**
 * "Se souvenir de moi" :
 *  - coché   → session conservée même après fermeture du navigateur (local)
 *  - décoché → session valable seulement tant que l'onglet est ouvert (session)
 * À appeler AVANT la connexion.
 */
const persist = (remember) => setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

export async function signUp(email, password, remember = true) {
  await persist(remember);
  const res = await createUserWithEmailAndPassword(auth, email, password);
  currentUser = res.user;
  return currentUser;
}

export async function signIn(email, password, remember = true) {
  await persist(remember);
  const res = await signInWithEmailAndPassword(auth, email, password);
  currentUser = res.user;
  return currentUser;
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export async function signInWithGoogle(remember = true) {
  await persist(remember);
  const provider = new GoogleAuthProvider();
  let res;
  if (auth.currentUser?.isAnonymous) res = await linkWithPopup(auth.currentUser, provider);   // anciens comptes anonymes : on garde l'uid
  else res = await signInWithPopup(auth, provider);
  currentUser = res.user;
  return currentUser;
}

export async function logout() {
  // Un brouillon de séance appartient à la personne connectée : on ne le laisse pas à la suivante.
  try { localStorage.removeItem('workoutDraft'); } catch {}
  await signOut(auth);
  currentUser = null;
  location.hash = '#/';
  location.reload();
}

/** Déconnexion sans recharger la page (compte bloqué). */
export async function signOutQuiet() {
  try { localStorage.removeItem('workoutDraft'); } catch {}
  await signOut(auth); currentUser = null;
}
