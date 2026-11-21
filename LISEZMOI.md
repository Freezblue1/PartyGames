# Ce soir on joue

Tous les jeux de soirée dans **un seul site** : la page d'accueil à la racine, chaque jeu dans son dossier.
Site 100 % statique (HTML/JS) branché sur Firebase. Personne n'a besoin de créer de compte pour jouer.

| Adresse | Dossier | Jeu |
|---|---|---|
| `/` | (racine) | Page d'accueil « Ce soir on joue » |
| `/quidenous/` | `quidenous` | Qui de nous… |
| `/undercover/` | `undercover` | Undercover |
| `/loup-garou/` | `loup-garou` | Loup-Garou |
| `/photoroulette/` | `photoroulette` | Photo Roulette |
| `/blanc-manger-coco/` | `blanc-manger-coco` | Blanc-manger coco |
| `/perudo/` | `perudo` | Perudo |
| `/quisuisje/` | `quisuisje` | Qui suis-je ? |
| `/poker/` | `poker` | Poker |
| `/kems/` | `kems` | Kems |

Chaque dossier a son propre `LISEZMOI.md` qui explique le jeu (fichiers, déroulé, secrets).

## Fichiers à la racine

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | La page d'accueil |
| `firestore.rules` | Les règles de sécurité **de tous les jeux**, à coller dans la console Firebase |
| `netlify.toml` | Dit à Netlify de publier ce dossier tel quel (pas de build) |
| `.gitignore` | Garde `inkwell` (projet à part) et `.claude` hors du dépôt |

## 1. Règles Firebase

Tous les jeux utilisent le même projet Firebase (`qui-de-nous-7244f`), chacun dans sa collection
(`rooms`, `ucRooms`, `lgRooms`, `prRooms`, `bmRooms`, `pdRooms`, `qsRooms`, `pkRooms`, `kmRooms`).

1. Va sur https://console.firebase.google.com et ouvre le projet **qui-de-nous-7244f**.
2. **Firestore Database** › onglet **Règles**.
3. Remplace **tout** le contenu par celui de `firestore.rules`, puis **Publier**.

Firestore n'a qu'un seul fichier de règles par projet : si tu recolles d'anciennes règles, un des jeux affichera « Accès refusé ». Il suffira de recoller ce fichier.

## 2. Mettre le site en ligne (un seul site Netlify)

Le site est relié au dépôt GitHub `Freezblue1/PartyGames` : chaque `git push` le met à jour tout seul.

1. Sur https://app.netlify.com : **Add new site › Import an existing project › GitHub** › choisis `Freezblue1/PartyGames`.
2. Laisse *Build command* vide et *Publish directory* sur `.` (c'est déjà dans `netlify.toml`) › **Deploy**.
3. *Site configuration › Change site name* : choisis le nom du site (ex. `jeuxsoireex` → `jeuxsoireex.netlify.app`).
4. Dans Firebase › Authentication › Paramètres › **Domaines autorisés**, ajoute cette adresse.

Ne glisse pas le dossier `Party Games` sur Netlify Drop : il contient aussi `inkwell` et ses `node_modules`.
Passe par GitHub, qui ne reçoit que les jeux.

Les jeux installés comme appli sur les téléphones prennent la nouvelle version tout seuls.

## Tester en local

```bash
python -m http.server 5518
```

Puis ouvre http://localhost:5518. `localhost` est déjà autorisé dans Firebase.

## Ajouter un jeu

1. Crée son dossier à la racine (ex. `mon-jeu/`), avec des chemins relatifs (`style.css`, `app.js`…).
2. Lien de retour vers l'accueil : `<a href="../">← Tous nos jeux</a>`.
3. Si le jeu a un `sw.js`, donne à son cache un préfixe unique (ex. `mj-v1`) : tous les jeux partagent la même adresse.
   Pareil pour les clés `localStorage` (chaque jeu a son préfixe : `qdn`, `uc`, `lg`, `pr`, `bmc`, `pdo`, `qsj`, `pkr`, `kms`).
4. Ajoute ses règles à `firestore.rules` (nouvelle collection), puis recolle le fichier dans Firebase.
5. Sur l'accueil : copie un bloc `<a class="game …">` dans `index.html` (lien `mon-jeu/`), et ses couleurs dans `style.css`
   sur le modèle de `.g-qdn`, `.g-uc`, `.g-lg`, `.g-pr`, `.g-bmc`, `.g-pdo`, `.g-qsj`, `.g-pkr`, `.g-kms`.

## Créer le projet Firebase (seulement si tu repars de zéro)

1. Va sur https://console.firebase.google.com et crée un projet (Google Analytics : pas nécessaire).
2. **Authentication** › Commencer › onglet *Sign-in method* › active **Anonyme**.
3. **Firestore Database** › Créer une base de données › région en Europe (ex. `europe-west1`) › mode production.
4. Colle `firestore.rules` dans l'onglet **Règles**, puis **Publier**.
5. Paramètres du projet › Général › *Vos applications* › icône **</>** (Web) › copie l'objet `firebaseConfig`.
6. Colle ces valeurs dans le `config.js` de chaque jeu.

## Coût

Le forfait gratuit de Firebase (Spark) suffit largement pour des soirées entre amis.
Photo Roulette range les photos réduites directement dans Firestore (pas besoin de Firebase Storage, qui est payant).
