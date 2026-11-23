# Poker

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Le Poker utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `pkRooms`.
Personne n'a besoin de créer de compte pour jouer. Les jetons sont pour de faux : aucun argent en jeu.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu (distribution, enchères, pots annexes, abattage) |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême), les mêmes que Perudo |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo, et son téléphone fait le croupier. Elle reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. De 2 à 10 joueurs.
- Le modo choisit :
  - les **jetons au départ** (500, 1 000, 2 000 ou 5 000), et si les **blindes montent** (toutes les 5 ou 10 mains) ;
  - un **chrono** par tour : au bout du temps, le joueur passe parole s'il le peut, sinon il se couche, et la main suivante se distribue toute seule 15 s après la fin ;
  - les **recaves** : qui n'a plus de jetons repart avec un tapis neuf, et les retardataires s'assoient en cours de partie ;
  - l'**aide au jeu** : chacun voit le nom de sa combinaison et ses chances de gagner la main ;
  - les **gages et vérités** pour le premier éliminé, avec des **gages maison**, et le **mode apéro**.
- Chacun voit **ses deux cartes sur son téléphone**, et seulement les siennes. Option « Cacher mes cartes » : il faut alors appuyer longtemps pour les voir.
- À ton tour, le téléphone vibre : **Se coucher**, **Parole**, **Suivre**, **Miser / Relancer** (avec − et +, ou Min, ½ pot, Pot, Tapis), ou **Tapis !** L'appli n'accepte que les mises permises (relance minimum, pas plus que ton tapis).
- Le donneur (D), les blindes, le flop, le turn et la river avancent tout seuls. Les **pots annexes** et les partages sont calculés par l'appli.
- À l'abattage, tout le monde voit les cartes des joueurs encore en lice, la combinaison de chacun et les 5 cartes gagnantes en surbrillance.
- Un joueur absent passe parole ou se couche tout seul. Le modo peut aussi jouer à la place de quelqu'un.
- À la fin : le classement, un **titre** pour chacun (Requin, Main en or, Bad beat, Le Roc, Kamikaze, Phénix…), le détail de sa partie, et un bouton pour **partager le classement en image** avec le coup de la soirée.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre le tapis, les mises et l'abattage, jamais les cartes cachées.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo** et la partie continue.
- **Mon profil** (sur l'accueil du jeu) : tes stats (sur ce téléphone, et dans ton compte si tu es connecté) (parties, victoires, pots gagnés, plus gros pot, plus belle main, titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de réseau ? **Jouer à plusieurs sur un seul téléphone** : le téléphone passe de main en main, chacun regarde ses cartes à son tour.

## Secret des cartes

Les règles Firebase font que chaque joueur ne peut lire que **ses** deux cartes, même en fouillant dans le navigateur.
On ne peut jouer que quand c'est son tour, un seul coup par tour, impossible à modifier ensuite.
Seul le téléphone du modo connaît le paquet, parce que c'est lui qui mélange et distribue. L'appli ne lui montre rien avant l'abattage, mais un modo tricheur pourrait le trouver avec les outils de développement.
