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
| `compte.js`, `config.js` | Le bouton « Se connecter » de l'accueil et la config Firebase qu'il utilise |
| `netlify/functions/compte.mjs`, `netlify/lib/comptes.mjs` | Le serveur des comptes (fonction Netlify, aucune dépendance à installer) |
| `firestore.rules` | Les règles de sécurité **de tous les jeux**, à coller dans la console Firebase |
| `netlify.toml` | Dit à Netlify de publier ce dossier tel quel (pas de build) et où trouver la fonction des comptes |
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

## 3. Activer les comptes (une seule fois)

Sur l'accueil, chacun peut créer un compte avec un **pseudo** et un **mot de passe**, sans e-mail.
Connecté, ton pseudo est proposé tout seul dans tous les jeux, sur tous tes appareils. Sans compte, on joue comme avant.

Le serveur des comptes a besoin d'une clé du projet Firebase :

1. Console Firebase › roue dentée › **Paramètres du projet** › onglet **Comptes de service** › **Générer une nouvelle clé privée**.
   Un fichier `.json` se télécharge. Il donne tous les droits sur le projet : ne l'envoie à personne et ne le mets pas dans le dossier.
2. Netlify › ton site › **Site configuration › Environment variables** › **Add a variable**, deux fois
   (coche *Contains secret values* et le scope *Functions*) :
   - `FIREBASE_CLIENT_EMAIL` : la valeur de `client_email` dans le fichier (finit par `iam.gserviceaccount.com`).
   - `FIREBASE_PRIVATE_KEY` : la valeur de `private_key`, en entier, de `-----BEGIN PRIVATE KEY-----` à `-----END PRIVATE KEY-----`.
3. **Deploys › Trigger deploy › Deploy site** pour que la fonction lise les variables.
4. Recolle `firestore.rules` dans Firebase (étape 1) : il verrouille les collections des comptes.
5. Une fois les variables enregistrées, tu peux supprimer le fichier `.json` de ton ordi.

Tant que ce n'est pas fait, le bouton répond « Les comptes ne sont pas encore configurés sur le serveur ».

**Règles des comptes**

- Pseudo : 3 à 18 caractères (lettres, chiffres, `.` `_` `-`), sans tenir compte des majuscules (`Léa` et `léa` sont le même compte).
- Mot de passe : 6 caractères au moins. Il est stocké chiffré (scrypt), jamais en clair.
- **Un seul compte par connexion internet.** L'IP n'est pas stockée : seulement une empreinte, impossible à retourner.
  En IPv6, c'est tout le bloc de la box (/64) qui compte, sinon il suffirait d'attendre que l'adresse change.
  Attention : tout le monde sur le même Wi-Fi partage la même IP, et certains opérateurs mobiles mettent beaucoup d'abonnés derrière une seule IP.
  En soirée, crée les comptes en 4G/5G, chacun de son côté, plutôt que sur le Wi-Fi.
- Après 10 mots de passe faux d'affilée, le compte est bloqué 15 minutes.
- Mot de passe oublié : il n'y a pas d'e-mail pour le récupérer. Dans Firestore, collection `accounts`, supprime le document
  dont le champ `pseudo` correspond ; la personne pourra recréer le compte. Pour libérer la connexion qui a servi à le créer,
  supprime aussi, dans `accountIps`, le document dont le champ `account` porte ce pseudo.

## Tester en local

```bash
python -m http.server 5518
```

Puis ouvre http://localhost:5518. `localhost` est déjà autorisé dans Firebase.
Les jeux marchent, mais pas les comptes : ils ont besoin de la fonction Netlify, qui ne tourne que sur le site en ligne.

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
