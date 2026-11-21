# Loup-Garou

Même principe que « Qui de nous… » et « Undercover » : un site statique (HTML/JS) branché sur Firebase.
Loup-Garou utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `lgRooms`.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu (nuit, votes, morts en chaîne, points) |
| `roles.js` | Les cartes et leurs explications (but, pouvoir, comment ça marche dans l'appli, conseils) |
| `gages.js` | Les gages et vérités, par thème (Soft → Extrême), les mêmes qu'Undercover |
| `style.css` | Le style : bleu nuit la nuit, parchemin le jour |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

Le jeu suit la **règle officielle** des Loups-Garous de Thiercelieux (https://www.regledujeu.fr/loup-garou-regle/), adaptée au téléphone.

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères. Les autres ouvrent le lien d'invitation ou tapent le code. La règle officielle se joue de 8 à 18 joueurs ; l'appli accepte dès 4.
- **Seul le modo choisit le meneur** : l'appli (tout le monde joue), lui-même, ou n'importe quel joueur. Le meneur ne reçoit pas de carte, voit toutes les coulisses (qui est qui, ce qui se passe la nuit, les cartes du centre) et fait avancer la partie. Les réglages, la distribution et la relance restent au modo.
- **Composition conseillée** : 1 loup jusqu'à 6 joueurs, 2 de 7 à 11, 3 à partir de 12 (règle officielle : 2 loups de 8 à 11 joueurs, 3 de 12 à 18), avec les personnages de la boîte de base ajoutés au fil des joueurs (Voyante, Sorcière, Chasseur, Cupidon, Petite Fille). Le modo peut tout changer : nombre de loups, Voleur, et les personnages d'**extensions** (Salvateur, Ancien, Idiot du village, Ange, Loup Blanc, Infect Père des Loups, Corbeau, Bouc émissaire, Enfant sauvage, Renard), classés à part car hors règle de base. Options : élection du Capitaine, chrono du débat.
- **Loups et Cupidon** : les loups doivent rester en minorité. Avec Cupidon, un loup peut tomber amoureux d'un villageois, qui joue alors contre le village : l'appli le compte comme un loup de plus. Par exemple, à 6 joueurs avec Cupidon, 1 seul loup (sinon 3 contre 3 dès le départ, partie ingagnable pour le village).
- **Compositions enregistrées** : le modo peut enregistrer une composition (« Soirée à 8 »…) et la recharger d'un geste à la partie suivante. Elles restent sur son téléphone.
- **Première nuit, préparation** : le **Voleur** regarde les deux cartes du centre (on a ajouté 2 Simples Villageois au paquet) et peut échanger sa carte (obligé si ce sont deux loups). Cupidon désigne les Amoureux, qui se reconnaissent.
- **Chaque nuit**, les rôles se réveillent **un par un**, dans l'ordre officiel : (nuit 1 : Voleur, Cupidon, Amoureux) (Enfant sauvage), puis Voyante, (Renard), (Salvateur), Loups-Garous avec la Petite Fille, (Loup Blanc, une nuit sur deux), Sorcière, (Corbeau). Seul le rôle appelé voit ses choix sur son téléphone ; tous les autres voient « Ferme les yeux ». Un rôle mort ou resté au centre est quand même appelé, pour que personne ne devine.
  - Les **loups doivent tous voter pour la même victime** (sinon, personne n'est dévoré). La **Petite Fille** peut espionner pendant leur tour : une fois sur trois, elle est surprise et dévorée à la place de la victime.
  - La **Sorcière** n'utilise qu'**une potion par nuit** : sauver la victime ou empoisonner quelqu'un, pas les deux (adaptation : la règle officielle autorise les deux la même nuit).
- **Le panneau du meneur** : les phrases à dire s'affichent au fil de la nuit (« Voyante, réveille-toi… »). Le meneur appuie sur « Réveiller la Voyante », voit en direct qui elle regarde et ce qu'est cette carte, puis appuie sur « Rendormir la Voyante » : seulement alors il peut appeler le rôle suivant. Il décide quand la nuit tombe et quand le jour se lève, lance le vote, voit les votes en direct, les révèle et prononce la sentence. Son carnet garde la liste de tout ce que la Voyante a vu, les Amoureux, les potions, les cartes du centre, ce que la Petite Fille a vu, le Capitaine, et « qui est qui ».
- **Sans meneur**, l'appli appelle les rôles toute seule, dans le même ordre, et passe au suivant dès qu'il a joué.
- **Le jour** : l'appli annonce les morts et leur carte. Le Chasseur tire en mourant, l'Amoureux meurt de chagrin, le Capitaine désigne son successeur. On débat, puis on vote : la majorité élimine, la voix du **Capitaine** compte double, et en cas d'égalité c'est lui qui tranche (sinon on revote entre les ex-æquo).
- **Amoureux** : l'appli les empêche de voter l'un contre l'autre, de se dévorer, de s'empoisonner ou de se tirer dessus.
- **Victoire** : le village gagne en éliminant le dernier loup ; les loups gagnent en éliminant le dernier villageois, ou dès qu'il ne reste qu'un loup face à un villageois (il le dévorerait la nuit suivante ; la partie continue seulement si ce villageois peut encore gagner : s'il est Capitaine et que le vote du jour arrive) ; un loup et un villageois amoureux gagnent ensemble s'ils sont les deux derniers.
- **Ange** (extension) : s'il est éliminé par le village au premier vote, la partie s'arrête et il gagne seul. Sinon, il devient simple villageois.
- **Autres extensions** : le **Loup Blanc** joue seul (une nuit sur deux il peut dévorer un loup ; il gagne s'il est le dernier en vie) ; l'**Infect Père des Loups** peut, une fois, transformer la victime des loups en loup au lieu de la tuer ; le **Corbeau** désigne un joueur qui commencera le vote avec 2 voix contre lui ; le **Bouc émissaire** est éliminé en cas d'égalité ; l'**Enfant sauvage** choisit un modèle et devient loup si son modèle meurt ; le **Renard** flaire un joueur et ses deux voisins, et perd son flair s'il n'y trouve aucun loup.
- Le bouton **🃏 Cartes**, toujours en haut de l'écran, explique chaque carte. Pendant la partie, « Lire le pouvoir de ma carte » ouvre l'explication de la sienne.
- Le modo peut **ne plus attendre** quelqu'un qui ne joue pas, et **arrêter la partie** à tout moment. Les points s'additionnent d'une partie à l'autre.
- **QR code** pour rejoindre : bouton « QR code » sous le code de la partie.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre le QR code, qui est réveillé la nuit, les morts, les votes et les cartes révélées, sans jamais montrer une carte secrète.
- **Avec un meneur**, c'est lui seul qui fait avancer la partie : la nuit qui tombe, le jour qui se lève, le passage au vote, la révélation des votes (il les voit arriver en direct, lui seul) et la sentence. Le modo, s'il joue, n'a plus ces boutons ; il garde la pause, l'arrêt de la partie, et peut laisser l'appli reprendre le rôle si le meneur se déconnecte.
- **Sans meneur**, le modo fait avancer le jour, et les votes se révèlent **tout seuls** quand tout le monde a voté (il garde « Révéler les votes » pour ne pas attendre).
- **Gages et vérités** (option dans les réglages) : à la fin, chaque perdant choisit sur son téléphone entre un gage et une vérité. Le modo coche les thèmes : Soft, Épicé, Hot, Extrême, et « Ce groupe ».
- **Gages maison** : chacun peut écrire ses gages et vérités. Seuls l'auteur et le modo les voient ; le modo les valide, et ils forment le thème « Ce groupe ».
- À la fin : un **titre** pour chacun (Loup parfait, Premier repas, Martyr, Flair de Voyante, Mouton…), les gages des perdants, le classement, et un bouton pour **partager le résultat en image**.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie.
- **Devenir le modo** : si le téléphone du modo ne répond plus depuis plus d'une minute (batterie, réseau), un bouton « Devenir le modo » apparaît chez tout le monde et la partie reprend là où elle en était. Les joueurs déconnectés sont marqués « absent ». Si c'est le meneur qui disparaît, le modo peut laisser l'appli prendre le relais.
- **Pause** : le modo (ou le meneur) met la partie en pause ; tout est figé, chrono compris.
- **Testament** : chacun peut écrire quelques mots pendant la partie (« Je savais que Bruno mentait »). Personne ne peut les lire avant sa mort ; ils sont révélés à tous quand il meurt.
- **Carnet de soupçons** : touche un joueur dans la liste pour le marquer « suspect » ou « sûr ». Visible seulement sur ton téléphone.
- **Récap de la partie** : à la fin, toute l'histoire nuit par nuit et jour par jour (qui la Voyante a regardé, les potions, les votes de chacun…).
- **Statistiques du groupe** : gardées dans la partie d'une manche à l'autre (victoires, meilleur loup, meilleur flair au vote, toujours mangé en premier, increvable).
- **Mon profil** (sur l'accueil du jeu) : tes stats gardées sur ton téléphone (parties, victoires, survie, rôles joués, contre qui tu votes le plus, titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.

## Secret des cartes

Les règles Firebase font que chaque joueur ne lit que **sa** carte et **ses** informations de nuit, même en fouillant dans le navigateur. Les votes des loups ne sont lisibles que par les loups.
Seul le téléphone du modo connaît toutes les cartes, parce que c'est lui qui distribue et fait tourner la nuit (le meneur peut les lire aussi, c'est son rôle). Quand le modo joue, l'appli ne lui montre rien, mais un modo tricheur pourrait les trouver avec les outils de développement. Pour une partie sans aucun doute possible, le modo se désigne lui-même **meneur**.
Les règles Firebase empêchent le meneur de changer de meneur ou de toucher aux réglages : seul le modo le peut. Les gages maison ne sont lisibles que par leur auteur et le modo. Un testament n'est lisible par les autres qu'une fois son auteur mort. On ne peut « Devenir le modo » que si le modo ne donne plus signe de vie.
