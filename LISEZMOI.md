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
| `soiree.js`, `soiree.css` | Commun à l'accueil et aux 9 jeux : fenêtre « Mon compte » (profil, stats, sauvegardes, admin), groupes, sauvegarde et partage des parties, lecteur « Revoir » |
| `config.js` | La config Firebase utilisée par `soiree.js` (la même que celle des jeux) |
| `netlify/functions/compte.mjs`, `netlify/lib/comptes.mjs` | Le serveur des comptes (fonction Netlify, aucune dépendance à installer) |
| `netlify/functions/menage.mjs` | Tâche de chaque nuit (fonction planifiée Netlify) : ferme les groupes inactifs depuis 3 jours |
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

Sur l'accueil, ou sur la page d'accueil de chaque jeu (bouton en haut à droite), chacun peut créer un compte
avec un **pseudo** et un **mot de passe**, sans e-mail. Sans compte, on joue comme avant, en tapant son prénom.

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
- **Un seul compte par téléphone.** À la création, le navigateur du téléphone reçoit un identifiant tiré au hasard,
  gardé sur le téléphone (rien à voir avec le numéro ou le modèle). Un deuxième compte depuis ce téléphone est refusé,
  avec le pseudo du compte existant. Plusieurs téléphones sur le même Wi-Fi peuvent chacun créer le leur.
  Limite : un site web ne peut pas reconnaître un téléphone à coup sûr. Quelqu'un qui efface les données du site,
  passe en navigation privée ou change de navigateur sera vu comme un nouveau téléphone. Sur iPhone, le jeu installé
  sur l'écran d'accueil et Safari comptent aussi comme deux téléphones différents.
- **Anti-robot** : au plus 20 comptes créés par connexion internet en 24 h (assez pour toute une soirée sur le même Wi-Fi).
  Sans ça, un script pourrait inventer un nouvel identifiant à chaque fois. L'IP n'est pas stockée, seulement une empreinte.
- Mot de passe oublié : il n'y a pas d'e-mail pour le récupérer. L'admin lui donne un nouveau mot de passe (voir plus bas).

## 4. Ce que fait un compte

- **Ton nom dans les jeux** : connecté, tu rejoins chaque partie sous ton pseudo, sans le retaper ni pouvoir le changer.
- **Ta couleur** : elle se choisit seulement dans « Mon compte » › Profil, et s'applique aux parties que tu rejoins ensuite.
- **Ton compte, toi-même** : « Mon compte » › Profil permet de changer ton mot de passe (il faut l'ancien) et de supprimer
  ton compte (il faut ton mot de passe). La suppression efface aussi ton profil, tes stats, tes sauvegardes et ta place
  dans ton groupe ; ton pseudo et ton téléphone redeviennent libres.
- **Tes stats** : les stats de chaque jeu (parties, victoires, titres…) sont gardées dans ton compte et te suivent sur tous
  tes appareils (« Mon compte » › Stats, les 9 jeux d'un coup). La première fois, celles déjà sur le téléphone sont reprises.
  Photo Roulette n'a pas de stats.
- **Les groupes** (accueil, « Jouer en groupe ») : crée un groupe et partage son code. Il faut un compte pour en faire partie.
  - Quand le chef entre dans une partie (il la crée, ou rejoint celle de quelqu'un), le téléphone de chaque membre ouvre
    ce jeu et rejoint la même partie tout seul.
  - **Qui est là** : un point vert pour chaque membre en ligne, avec où il est (« sur l'accueil », « dans Perudo »).
    Le chef voit si tout le monde est prêt avant de lancer.
  - **Le chef** passe son rôle avec 👑 à côté d'un membre. S'il quitte le groupe, le rôle passe tout seul à quelqu'un
    (en ligne d'abord). S'il disparaît sans partir, au bout de 10 minutes n'importe quel membre peut « Devenir chef ».
  - Le groupe n'est pas dissous à la fin d'une partie : on y reste d'une partie à l'autre, et on revient avec le même code.
    Un groupe où personne n'est passé depuis **3 jours** est fermé automatiquement (tâche du serveur, chaque nuit).
  - **Classement du groupe** : les victoires de chacun, tous jeux confondus, d'après les stats des comptes.
- **Sauvegardes** : à la fin d'une partie, une barre propose de garder **la partie entière** ou **le résultat** (le classement).
  On les retrouve dans « Mon compte » › Sauvegardes.
- **Revoir** : ce n'est pas une vidéo. Chaque jeu tient le journal de ce qui s'est passé, à partir de son propre historique
  (« Ana annonce 2 dés de 6 », « Ben dit Dudo : il n'y en avait qu'un, Ben perd un dé »), et le lecteur reconstruit la partie
  coup par coup, avec le score qui évolue en haut (dés, points, jetons, lettres…). Lecture, pause, coup par coup, barre
  pour avancer. Ce que chaque jeu raconte :

  | Jeu | Le journal |
  |---|---|
  | Perudo | Chaque annonce, chaque Dudo / Calza, ce qu'il y avait sous les gobelets, qui perd ou regagne un dé |
  | Qui de nous… | Chaque question et son verdict ; le vote du propriétaire de la sauvegarde (les autres votes restent secrets) |
  | Undercover | Les indices de chaque tour, les votes, chaque élimination et son rôle, les deux mots, le vainqueur |
  | Loup-Garou | Le récap de la partie : chaque nuit et chaque jour (voyante, loups, sorcière…), les morts, le vainqueur |
  | Photo Roulette | Pour chaque photo : qui a pensé à qui, à qui elle était, qui a marqué (sans les photos) |
  | Blanc-manger coco | Chaque question, chaque réponse complète avec ses voix, qui marque |
  | Qui suis-je ? | Chaque question et sa réponse (oui / non), chaque proposition, qui a trouvé quoi |
  | Poker | Chaque main action par action (blindes, mises, relances, tapis), le flop / turn / river, qui gagne le pot |
  | Kems | Chaque « Kems ! » et « Contre ! », réussi ou non, et les lettres de chaque équipe |

  Comme le journal est construit à la fin de la partie à partir de ce que la partie a gardé, recharger la page en
  pleine partie ne fait rien perdre.
- **Partager** une sauvegarde : « Partager » crée un lien (copié sur ordinateur, menu de partage sur téléphone).
  N'importe qui peut revoir la partie avec, même sans compte. « Ne plus partager » coupe le lien.

## 5. Admin

L'admin a tous les droits : il lit et modifie toutes les données des jeux. Son onglet **Admin** a trois parties :

- **Comptes** : tous les comptes créés depuis le début (même supprimés, par l'admin ou par leur propriétaire),
  leurs sauvegardes, un nouveau mot de passe, **suspendre** (plus de connexion, la session en cours s'arrête dans l'heure,
  rien n'est effacé, « Réactiver » pour revenir) ou supprimer.
- **En direct** : toutes les parties des 9 jeux (en cours ou non, nombre de joueurs, dernière action), avec un lien pour
  les regarder en mode grand écran et un bouton pour les fermer ; tous les groupes, leurs membres et qui est en ligne.
- **Firebase** : les lectures, écritures et suppressions du jour face aux limites du forfait gratuit (50 000 / 20 000 / 20 000),
  et le nombre de comptes, sauvegardes, parties et groupes.

Pour devenir admin :

1. Crée d'abord ton compte normalement sur le site (ex. `Freezblue`).
2. Netlify › **Environment variables** › ajoute `ADMIN_PSEUDO` = ton pseudo (plusieurs admins : séparés par des virgules).
3. **Deploys › Trigger deploy**, puis déconnecte-toi et reconnecte-toi : l'onglet **Admin** apparaît dans « Mon compte ».

Pour la partie **Firebase**, le compte de service doit pouvoir lire les statistiques (une seule fois) :
https://console.cloud.google.com › projet **qui-de-nous-7244f** › **IAM et administration › IAM** › la ligne
`firebase-adminsdk-…@qui-de-nous-7244f.iam.gserviceaccount.com` › crayon › **Ajouter un rôle** › « **Lecteur Monitoring** »
(Monitoring Viewer) › Enregistrer. Sans ça, la partie Firebase l'explique au lieu d'afficher les chiffres.

Un pseudo listé dans `ADMIN_PSEUDO` ne peut plus être créé par inscription : c'est pour ça que le compte se crée avant.
Pour retirer un admin, enlève son pseudo de `ADMIN_PSEUDO` et redéploie : les actions de l'onglet Admin sont refusées tout de suite, ses droits
sur les données disparaissent à sa prochaine déconnexion.
Supprimer un compte libère son pseudo et son téléphone ; il reste dans la liste, marqué « Supprimé ».

## 6. Protection des connexions

- 10 mots de passe faux d'affilée sur un compte : ce compte est bloqué 15 minutes.
- 30 mots de passe faux depuis une même connexion internet, sur n'importe quels comptes : cette connexion ne peut plus
  se connecter pendant 15 minutes (ça arrête quelqu'un qui essaie le même mot de passe sur plein de comptes).
  Les autres connexions ne sont pas touchées. L'IP n'est pas stockée, seulement une empreinte.

## Tester en local

```bash
python -m http.server 5518
```

Puis ouvre http://localhost:5518. `localhost` est déjà autorisé dans Firebase.
Les jeux marchent, mais pas les comptes : ils ont besoin de la fonction Netlify, qui ne tourne que sur le site en ligne.
En local seulement, la console du navigateur a `window.soireeDev` : `journal()` donne le journal de la partie en cours,
et un journal mis dans `sessionStorage["soiree-dev-replay"]` se rejoue avec `?revoir=local` dans l'adresse du jeu.

## Tests automatiques (dossier `tests`)

Ils tournent sur l'ordi, avec les **émulateurs Firebase** : rien ne touche au vrai projet ni aux vrais comptes.

| Commande (dans `tests`) | Ce qui est vérifié | Durée |
|---|---|---|
| `npm run test:server` | Le serveur des comptes : inscription, un compte par téléphone, plafond anti-robot, connexion, blocage par compte et par connexion, mot de passe, suppression, admin (suspendre, usage), fermeture des groupes inactifs | quelques secondes |
| `npm run test:rules` | `firestore.rules` se charge sans erreur, et : un membre ne peut pas piloter le groupe d'un autre ni prendre la place du chef s'il est là, personne ne lit les sauvegardes d'un autre sauf partagées, personne ne fausse sa présence, les stats et données des comptes sont protégées, l'admin peut tout | ~20 s |
| `npm run test:e2e` | Dans de vrais navigateurs (Edge) : deux joueurs, groupe, le membre suit le chef, une vraie partie de Qui de nous, sauvegardes, « Revoir », partage (ouvert sans compte), stats, qui est en ligne, classement, passer le rôle de chef ; le journal de chacun des 9 jeux sur une partie d'exemple ; mot de passe, suppression de son compte, admin (suspendre, en direct, Firebase) | ~1 min |
| `npm test` | Les trois, dans l'ordre | |

Première fois : `cd tests` puis `npm install`. Les émulateurs ont besoin de Java 21 : s'il n'est pas installé,
mets un JDK dans `tests/.jdk` (ex. le zip Temurin 21 de https://adoptium.net, décompressé là) ; `with-emulators.mjs` l'utilise tout seul.

**Avant de publier de nouvelles règles** dans la console Firebase, lance `npm run test:rules` : une faute de frappe
apparaît là, avec le message de Firebase, au lieu de casser les jeux en ligne.

Si un test e2e échoue, la capture d'écran et la trace sont dans `tests/test-results`
(`npx playwright show-trace tests/test-results/…/trace.zip` pour la rejouer).

## Ajouter un jeu

1. Crée son dossier à la racine (ex. `mon-jeu/`), avec des chemins relatifs (`style.css`, `app.js`…).
2. Lien de retour vers l'accueil : `<nav class="hub-back"><a href="../">← Tous nos jeux</a></nav>` (le bouton du compte s'y ajoute).
   Branche `soiree.js` comme dans les autres jeux : `import * as Soiree from "../soiree.js"`, puis cherche `Soiree.` dans
   un `app.js` existant (démarrage, `enterRoom`, `joinRoom`, `needNick`, `store.set`, et l'enveloppe de `render` avant `boot()`).
   Pour « Revoir » : `Soiree.setJournal(() => ({ players, events, final }))`, construit à partir de l'historique du jeu
   (voir le journal de Perudo, en bas de `perudo/app.js`). Pour les stats : `Soiree.statsSaved(p)` dans `saveProfile`
   et `await Soiree.syncStats(store)` au démarrage. Ajoute aussi une partie d'exemple dans `tests/e2e/journals.spec.mjs`.
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
