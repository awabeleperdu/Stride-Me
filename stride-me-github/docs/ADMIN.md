# Espace administrateur — mise en place

## 1. Règles Firestore (obligatoire, gratuit)
Console Firebase → Firestore Database → **Règles** → colle le contenu de `firestore.rules` → **Publier**.

## 2. Te déclarer administrateur (une seule fois, à la main)
1. Connecte-toi une fois à l'appli avec ton compte.
2. Console → **Authentication → Utilisateurs** → copie ton **UID**.
3. Console → **Firestore** → **Démarrer une collection** : ID `admins` → ID du document = ton UID → ajoute un champ `since` (texte) → Enregistrer.

Personne ne peut s'ajouter admin depuis l'appli : les règles interdisent toute écriture dans `admins`.
Recharge l'appli : Profil → **Espace administrateur**.

## 2 bis. Code d'accès
À la première ouverture de l'espace admin, l'appli te demande de **créer un code** (6 caractères minimum). Ensuite il est demandé à chaque ouverture
(et après 5 min d'inactivité ; bouton « Verrouiller » et « Changer le code » en haut du panneau). Après 5 mauvais essais : blocage temporaire de 30 s, qui double à chaque nouvel échec.
Le code est stocké sous forme d'empreinte (PBKDF2, sel aléatoire) dans `admin_secrets/<ton UID>`, jamais en clair. Si tu l'oublies : supprime ce document dans la console, l'appli te demandera d'en créer un nouveau.

⚠️ C'est un **verrou d'application** : il protège un téléphone ou une session laissés ouverts. La vraie barrière serveur reste le rôle `admins/<UID>` dans les règles.
Pour verrouiller côté serveur (le code serait vérifié par une Cloud Function qui ouvre une « session admin » de 10 min exigée par les règles), dis-le-moi : à faire avec le déploiement des fonctions (§3).

## 3. Suppression complète / blocage réel (plan Blaze + Firebase CLI)
Sans ces fonctions, « Supprimer » efface toutes les données du compte et le bloque, mais son identifiant
de connexion reste à retirer à la main (Authentication → Utilisateurs → ⋮ → Supprimer). Avec les fonctions, tout est fait d'un coup
(données + stockage + identifiant), et « Bloquer » désactive vraiment la connexion.

```bash
npm install -g firebase-tools
firebase login
firebase use ironlog-75f32
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

## Ce qui est collecté (transparence)
Par compte : e-mail, date de création, dernière activité, nombre d'ouvertures, nombre de séances.
Par appareil : navigateur + système (ex. « Chrome · Android »), première/dernière vue, nombre d'ouvertures.
Chaque utilisateur voit sa propre liste dans Profil → Mes appareils. Le contenu des séances n'est jamais affiché dans l'espace admin.
Le web ne donne pas le vrai nom d'un appareil : chacun peut le renommer (« Mon iPhone »).
