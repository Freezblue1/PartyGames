# Qui suis-je ?

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Qui suis-je utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `qsRooms`.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu |
| `persos.js` | Les persos à deviner, en 11 thèmes (environ 700) — à modifier librement |
| `infos.js` | L'image et la courte description de chaque perso (le « ? » du post-it), tirées de Wikipédia et Wikimedia Commons |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême), les mêmes que les autres jeux |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

Dans `persos.js`, une ligne comme `"Zinédine Zidane|Zidane|Zizou"` veut dire : le post-it affiche « Zinédine Zidane »,
et « Zidane » ou « Zizou » comptent aussi comme bonnes réponses. Les accents, les majuscules et les articles ne comptent pas.

Chaque post-it montre une **image** du perso, et un bouton **?** qui affiche une courte description (« Footballeur et entraîneur français »).
Elles viennent de `infos.js` : une ligne par perso, `"Nom exact dans persos.js": {"i": "adresse de l'image", "d": "description"}`.
Les images restent sur les serveurs de Wikimédia (il faut du réseau pour les voir ; sans réseau, le post-it s'affiche sans image).
Ce sont toutes des images libres : pour les persos de dessins animés et de films, dont les images officielles sont protégées,
ce sont des photos de statues, de figurines ou de costumes trouvées sur Wikimedia Commons. Quand rien de correct n'existait
(Snoopy, Garfield, Scooby-Doo, les Minions…), le post-it reste sans image plutôt qu'avec un logo.
Un perso ajouté dans `persos.js` sans ligne dans `infos.js` s'affiche simplement sans image ni « ? ».
Pour lui en donner une : sur sa page Wikipédia, clic droit sur la photo › « Copier l'adresse de l'image », et ajoute sa ligne dans `infos.js`.
Le thème « Après minuit » n'a volontairement ni images ni descriptions. Un perso écrit par un joueur a son image s'il fait partie de la pioche (« le Joker » trouve celle du Joker), ou la photo que le joueur a ajoutée.

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. De 2 à 12 joueurs.
- Le modo choisit :
  - les **thèmes** des persos (stars, films et séries, dessins animés, histoire, sport, animaux, bouffe, objets, métiers, et « Après minuit » pour les soirées sans enfants) ;
  - **qui choisit les persos** : la pioche, ou **les joueurs** (chacun écrit en secret le perso d'un autre, tiré au sort) ;
  - les **questions à l'oral** : plus de clavier, on pose sa question et on dit qui on pense être à voix haute, puis on appuie sur un bouton (les autres répondent toujours sur leur téléphone) ;
  - **rejouer après un oui** ou une seule question par tour, la **fin de partie** (au premier qui trouve, à l'avant-dernier, ou quand tout le monde a trouvé) et un **chrono** par tour ;
  - les **gages et vérités** pour le perdant, avec des **gages maison**, et le **mode apéro**.
- **Persos maison** : chacun peut proposer des persos que tout le groupe connaît (tonton Gérard, la prof de maths…). On peut leur ajouter une **photo** (prise sur le moment ou choisie dans la galerie) : elle s'affiche sur le post-it, à la place de l'image Wikipédia. Seuls l'auteur et le modo les voient ; ils ont une chance sur deux de sortir, jamais sur leur auteur. Le modo peut exiger de les valider d'abord (il voit aussi la photo, et peut la refuser).
  Même chose en mode « les joueurs choisissent » : on peut joindre une photo au perso qu'on donne.
  Les photos sont réduites par le téléphone (360 pixels) et rangées directement dans Firebase, comme dans Photo Roulette : pas besoin de forfait payant.
- Chacun voit sur son téléphone **le post-it de tous les autres, jamais le sien**, avec l'image du perso. Tu ne sais pas qui c'est ? Touche le **?** du post-it.
- À ton tour, le téléphone vibre. Tu tapes ta question (ou tu la poses à voix haute) : les autres répondent **Oui**, **Non** ou **Je ne sais pas** sur leur téléphone. Dès que tout le monde a répondu, la réponse tombe.
- Tu crois savoir ? Tu écris ta réponse : les autres voient si elle correspond au post-it et valident. Trouvé : ton post-it se dévoile. Raté : la main passe.
- **Ce que tu sais déjà** : toutes tes questions et leurs réponses restent sous tes yeux, avec un bloc-notes « Mes pistes » gardé sur ton téléphone.
- Un joueur absent est sauté. Au bout du chrono, la main passe. Le modo peut aussi passer le tour de quelqu'un, ou clore les réponses.
- On peut **rejoindre en cours de partie** : on regarde, et on joue à la suivante.
- À la fin : chacun découvre son post-it, le classement, un **titre** pour chacun (Sherlock, Têtu, Philosophe, Sur une lancée…), toutes les questions de chacun, et un bouton pour **partager le classement en image** avec le coup de la soirée.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre les questions, les réponses et la table, jamais un post-it pas encore trouvé.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo** et la partie continue.
- **Mon profil** (sur l'accueil du jeu) : tes stats gardées sur ton téléphone (parties, victoires, persos trouvés, ton record, les persos que tu as été, ton titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de réseau ? **Jouer sur un seul téléphone** : à ton tour, tu colles le téléphone sur ton front, écran vers les autres. Ils voient ton perso et touchent les réponses.

## Secret des post-it

Les règles Firebase font que personne ne peut lire son propre post-it, même en fouillant dans le navigateur,
tant qu'il ne l'a pas trouvé ou que la partie n'est pas finie. Un post-it est toujours écrit par quelqu'un d'autre
que son propriétaire (le modo pioche ceux des autres, et un autre joueur pioche celui du modo), et ne peut plus être changé.
On ne peut jouer que quand c'est son tour, et répondre qu'aux questions des autres.
Un tricheur pourrait quand même rejoindre la partie avec un deuxième téléphone pour lire son post-it : c'est un jeu entre amis !
