# Perudo

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Perudo utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `pdRooms`.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême), les mêmes que Blanc-manger coco |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. De 2 à 10 joueurs.
- Le modo choisit :
  - le nombre de dés par joueur (3, 4, 5 ou 6) et un **chrono** par tour ;
  - les règles : **Palifico**, **Calza**, et l'**aide au calcul** (chacun voit, d'après ses propres dés, les chances que l'annonce soit vraie) ;
  - les **gages et vérités** pour le premier sorti, avec des **gages maison**, et le **mode apéro**.
- Chacun voit **ses dés sur son téléphone**, et seulement les siens. Option « Cacher mes dés sous le gobelet » : il faut alors appuyer longtemps pour les voir, pratique quand le voisin regarde.
- À ton tour, le téléphone vibre. Tu touches une valeur, tu règles la quantité avec − et +, puis **Annoncer**. L'appli n'accepte que les annonces qui montent vraiment (et fait le calcul des pacos à ta place). Ou bien : **Dudo !** ou **Calza !**
- Les gobelets se soulèvent tout seuls : tout le monde voit tous les dés, ceux qui comptent en couleur, et qui perd (ou regagne) un dé.
- Un joueur absent est sauté. Au bout du chrono, l'appli surenchérit au minimum à sa place. Le modo peut aussi passer le tour de quelqu'un.
- **Gages maison** : chacun peut écrire ses gages et vérités. Seuls l'auteur et le modo les voient ; ils ont une chance sur deux de tomber sur le perdant. Le modo peut exiger de les valider d'abord.
- On peut **rejoindre en cours de partie** : on regarde, et on joue à la suivante.
- À la fin : le classement, un **titre** pour chacun (Roi du calza, Kamikaze, Détecteur de mensonges, Poker face…), le détail de ses coups, et un bouton pour **partager le classement en image** avec le coup de la soirée.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre la table, les annonces et les gobelets soulevés, jamais les dés cachés.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo** et la partie continue.
- **Mon profil** (sur l'accueil du jeu) : tes stats gardées sur ton téléphone (parties, victoires, dudos gagnants, calzas, ta valeur fétiche, ton titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de réseau ? **Jouer à plusieurs sur un seul téléphone** : le téléphone passe de main en main, chacun regarde ses dés à son tour.

## Secret des dés

Les règles Firebase font que chaque joueur ne peut lire que **ses** dés, même en fouillant dans le navigateur.
On ne peut jouer que quand c'est son tour, un seul coup par tour, impossible à modifier ensuite.
Seul le téléphone du modo connaît tous les dés, parce que c'est lui qui les lance. L'appli ne les lui montre pas avant le dudo, mais un modo tricheur pourrait les trouver avec les outils de développement.
