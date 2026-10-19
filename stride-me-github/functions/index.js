// Cloud Functions d'administration (nécessitent le plan Blaze). Déploiement : voir ADMIN.md
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
const REGION = 'europe-west1';   // doit correspondre à js/firebase-config.js

/** Vérifie que l'appelant est administrateur (document admins/{uid}) et renvoie l'uid cible. */
async function guard(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const db = getFirestore();
  if (!(await db.doc(`admins/${req.auth.uid}`).get()).exists) throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  const uid = req.data && req.data.uid;
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new HttpsError('invalid-argument', 'uid manquant.');
  if (uid === req.auth.uid) throw new HttpsError('failed-precondition', 'Impossible sur ton propre compte.');
  if ((await db.doc(`admins/${uid}`).get()).exists) throw new HttpsError('failed-precondition', 'Retire d\'abord ce compte de la liste des admins (console).');
  return uid;
}

exports.adminSetDisabled = onCall({ region: REGION }, async (req) => {
  const uid = await guard(req);
  const disabled = req.data.disabled === true;
  await getAuth().updateUser(uid, { disabled });                       // bloque / débloque la connexion elle-même
  await getAuth().revokeRefreshTokens(uid);                            // coupe les sessions ouvertes
  await getFirestore().doc(`users/${uid}`).set({ disabled, disabledAt: disabled ? Date.now() : null }, { merge: true });
  return { ok: true };
});

exports.adminDeleteUser = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  const uid = await guard(req);
  const db = getFirestore();
  for (const [col, field] of [['workouts', 'userId'], ['exercises', 'ownerId']]) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    let batch = db.batch(), n = 0;
    for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
    await batch.commit();
  }
  await db.doc(`schedule_rotation/${uid}`).delete().catch(() => {});
  await db.recursiveDelete(db.doc(`users/${uid}`));                    // inclut les appareils
  await getStorage().bucket().deleteFiles({ prefix: `exercises/${uid}/` }).catch(() => {});
  await getAuth().deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  return { ok: true };
});
