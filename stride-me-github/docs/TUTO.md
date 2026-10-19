# Stride Me : mettre le site en ligne, de A à Z

Durée : environ 30 minutes. Coût : 0 €. Il te faut un compte Google (pour Firebase) et un compte GitHub.

Le site = des fichiers statiques hébergés gratuitement par **GitHub Pages**. La base de données et les comptes = **Firebase** (gratuit pour 3 à 4 utilisateurs).

---

## Étape 1 : Firebase (comptes + base de données)

1. Va sur https://console.firebase.google.com et connecte-toi avec ton compte Google.
2. Ouvre ton projet. Le fichier `js/firebase-config.js` contient déjà la config du projet `ironlog-75f32`. **Si c'est bien ton projet, rien à changer.**
   Si tu en crées un nouveau : « Ajouter un projet » > nom au choix > termine > roue dentée > « Paramètres du projet » > « Vos applications » > icône `</>` (Web) > copie le bloc `firebaseConfig` et remplace-le dans `js/firebase-config.js`.
3. **Authentication** (menu de gauche) > « Commencer » > onglet « Sign-in method » > **E-mail/Mot de passe** > active > Enregistrer.
4. **Firestore Database** > « Créer une base de données » > région **europe-west1** (ou eur3) > **mode production** > Créer.
5. Dans Firestore > onglet **Règles** : efface tout, colle le **BLOC 1** du fichier `docs/FIREBASE-A-COLLER.txt`, clique **Publier**.

> Il n'y a pas de SQL dans Firebase : aucune table à créer. Les données se créent toutes seules au premier usage.

**Storage (photos) : facultatif.** Firebase le réserve maintenant au plan Blaze (carte bancaire). Sans Storage, tout marche sauf l'envoi de photos de machines. Le catalogue de 619 exercices a déjà ses images, il n'en a pas besoin.

## Étape 2 : GitHub (héberger le site)

1. Va sur https://github.com > **New repository**. Nom : `stride-me` (ou autre). Public. Crée-le.
2. Dézippe `stride-me-github.zip` sur ton ordinateur.
3. Dans ton dépôt : **Add file > Upload files**. Ouvre le dossier dézippé, sélectionne **tout son contenu** (`index.html`, dossiers `css`, `js`, `assets`, `docs`, etc.) et glisse-le dans la page. Attends la fin du chargement.
   (Il y a moins de 100 fichiers : c'est la limite de GitHub pour l'envoi par navigateur.)
4. En bas : **Commit changes**.
5. **Settings > Pages** : « Source » = **Deploy from a branch** > Branch **main** / dossier **/ (root)** > Save.
6. Attends 1 à 2 minutes. L'adresse apparaît en haut de la page : `https://TONPSEUDO.github.io/stride-me/`

## Étape 3 : autoriser le site dans Firebase

Sans ça, la connexion échoue (erreur `auth/unauthorized-domain`).

Firebase > **Authentication > Paramètres > Domaines autorisés** > Ajouter un domaine : `TONPSEUDO.github.io` (sans `https://` ni `/stride-me`).

## Étape 4 : premier test

1. Ouvre l'adresse du site. Crée un compte (e-mail + mot de passe).
2. Planning > Séances > **Code de séance · importer** > tape `2008` > Chercher > Ajouter.
3. Lance une séance, valide une série : le minuteur se lance. Termine la séance, regarde l'Historique.

## Étape 5 : te déclarer administrateur

1. Firebase > Authentication > Utilisateurs > copie ton **UID**.
2. Firestore > **Démarrer une collection** : ID `admins` > ID du document = ton UID > champ `since` (string) = `2026` > Enregistrer.
3. Recharge le site : Profil > **Espace administrateur**. À la première ouverture, il te demande de créer un code (6 caractères minimum).

Tu peux alors voir les comptes, bloquer ou supprimer, et ajouter des exercices visibles par tout le monde.

## Étape 6 : inviter les 3 à 4 personnes

Envoie-leur l'adresse du site. Chacun crée son compte. Donne-leur le code `2008` pour récupérer le programme.
Sur téléphone : menu du navigateur > **Ajouter à l'écran d'accueil**.

## Mettre à jour le site plus tard

GitHub > ton dépôt > ouvre le fichier à changer > crayon > colle > Commit. Ou **Add file > Upload files** pour remplacer des fichiers.
Si un téléphone garde l'ancienne version : recharge sans cache (Ctrl+Maj+R), ou ferme et rouvre l'onglet.

---

## Problèmes fréquents

| Message / symptôme | Cause | Solution |
|---|---|---|
| Page blanche | Mauvais dossier envoyé (fichiers dans un sous-dossier) | `index.html` doit être à la **racine** du dépôt |
| `auth/unauthorized-domain` | Domaine pas autorisé | Étape 3 |
| `auth/operation-not-allowed` | E-mail/mot de passe pas activé | Étape 1, point 3 |
| `Missing or insufficient permissions` | Règles Firestore absentes | Étape 1, point 5 |
| Espace admin invisible | Document `admins/UID` absent ou mauvais UID | Étape 5 |
| Code de séance « introuvable » | Faute de frappe, ou règles pas publiées | Vérifie le code ; republie le BLOC 1 |
| Images d'exercices absentes | Pas de connexion à GitHub ou Internet coupé | Elles sont chargées depuis le dépôt public `free-exercise-db` |
| Code admin oublié | | Firestore : supprime le document `admin_secrets/TON_UID`, rouvre l'espace admin |

## Limites à connaître

- **Blocage et suppression complète d'un compte** (Authentication) demandent des Cloud Functions, donc le plan Blaze (voir `docs/ADMIN.md`). Sans elles, l'admin efface les données du compte mais pas son identifiant de connexion.
- Le plan gratuit (Spark) offre largement de quoi tenir à 3-4 personnes (1 Go de stockage, 50 000 lectures par jour).
- La clé dans `firebase-config.js` n'est pas secrète : ce sont les règles Firestore qui protègent les données.
