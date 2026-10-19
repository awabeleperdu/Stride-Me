# Stride Me – Fitness Log

Application web de suivi de musculation (HTML / CSS / JavaScript sans build, Firebase, GitHub Pages).

**Fonctions** : planning en roulement qui se réadapte, séances guidées avec mémoire des charges, minuteur de repos global (sonnerie, plein écran), échauffement personnalisable, catalogue de 619 exercices en français avec images et schémas, courbes de progression par exercice, IMC et mensurations, codes de séance (partage et programme `2008`), zones musculaires, 5 thèmes, espace administrateur.

## Publier
Suis `docs/TUTO.md` (30 min, gratuit). Pour te faire guider pas à pas par une IA : `docs/PROMPT_GEMINI.txt`.

## Structure
```
index.html              page unique (point d'entrée)
manifest.webmanifest    installation sur l'écran d'accueil
css/                    styles et thèmes
js/main.js              démarrage ; les autres fichiers de js/ sont les écrans
js/firebase-config.js   TA config Firebase (à vérifier avant de publier)
assets/                 logos ; assets/catalog/catalog.json = catalogue d'exercices
firestore.rules         règles de sécurité (à coller dans Firebase)
storage.rules           règles des photos (optionnel)
functions/              fonctions admin (optionnel, plan Blaze)
docs/                   tuto, prompt Gemini, aide admin
```

Catalogue : base libre [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (domaine public), traduite en français.
