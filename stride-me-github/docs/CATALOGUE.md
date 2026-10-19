# Catalogue d'exercices

- `assets/catalog/catalog.json` : 619 exercices (nom FR quand disponible, muscle, matériel, consignes).
- `assets/catalog/<id>-0.webp` / `-1.webp` : images (16 Mo au total, dans le repo GitHub, rien en base Firestore).
- Source : free-exercise-db (domaine public) — https://github.com/yuhonas/free-exercise-db
- Les exercices du catalogue ne créent aucun document Firestore tant que tu ne les ajoutes pas à ta bibliothèque.
- Tes propres photos de machines (onglet Exercices) restent prioritaires sur celles du catalogue.
- Les pages « un seul fichier » (stride-me*.html) chargent les images depuis GitHub ; le dossier du projet les sert en local.
- Build : `npm i esbuild && TOOLS=$PWD bash build.sh` (ou `npm i esbuild` dans `.tools/`).
