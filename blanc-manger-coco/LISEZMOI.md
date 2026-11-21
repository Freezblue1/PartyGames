# Blanc-manger coco

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Blanc-manger coco utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `bmRooms`.
Personne n'a besoin de créer de compte pour jouer.

Toutes les cartes ont été écrites pour ce jeu : ce ne sont pas celles du jeu en boîte.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu |
| `cards.js` | Le paquet de base : questions à trous et réponses, par niveau (Soft, Piquant, Trash, Extrême). À modifier librement |
| `extensions.js` | Les paquets à thème : Soirée & apéro, Boulot, Famille, Sans filtre (le plus trash). On peut en ajouter |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême) |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que Qui de nous) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

Pour créer un paquet, copie un bloc de `extensions.js` et change son `id`, son nom, sa description et ses cartes.
Dans `cards.js` comme dans `extensions.js`, `___` marque un trou (deux au plus par question). Une réponse s'écrit sans majuscule ni point final :
la majuscule est ajoutée toute seule quand la réponse ouvre la phrase.

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. Il faut au moins 3 joueurs.
- Le modo choisit :
  - **Juge tournant** (un juge choisit sa réponse préférée, et qui gagne la manche devient le juge de la suivante ; sans gagnant, ou si le gagnant ne répond plus, c'est le voisin du juge) ou **Tout le monde vote** (chacun vote pour la meilleure, jamais la sienne) ;
  - le niveau (Soft, Piquant, Trash, Extrême). Un niveau garde les cartes plus douces mais pioche surtout dans le sien : en Extrême, environ 7 cartes sur 10 sont Trash ou Extrême ;
  - les paquets : le paquet de base et les extensions à thème, à combiner. « Sans filtre » ne contient que du Trash et de l'Extrême ;
  - le score à atteindre (3, 5, 7 ou 10 points) et un chrono ;
  - les **gages et vérités** pour le ou les derniers, et le **mode apéro**.
- Chacun reçoit 10 cartes, visibles **uniquement sur son téléphone**. On touche une carte : elle se glisse dans le trou de la question pour voir ce que ça donne, puis « Jouer cette carte ». On peut changer d'avis tant que les réponses ne sont pas sur la table.
- Les réponses arrivent **toutes seules**, mélangées et sans nom, dès que tous les joueurs connectés ont joué (le modo garde un bouton pour ne pas attendre). Le juge les lit à voix haute et choisit.
- Ensuite tout le monde voit **qui a joué quoi**, et la main se recomplète à 10 cartes.
- **Cartes maison** : chacun peut écrire ses questions et ses réponses. Seuls l'auteur et le modo les voient ; elles arrivent par surprise, en haut des pioches. Le modo peut exiger de les valider d'abord.
- On peut **rejoindre en cours de partie** : on reçoit ses cartes à la manche suivante.
- Un joueur absent n'est pas attendu. Si le juge disparaît, le modo peut changer de juge ou choisir à sa place.
- À la fin : le classement, un **titre** pour chacun (Roi de la vanne, Chouchou d'Alice, Génie incompris…), les phrases gagnantes de chacun, et un bouton pour **partager le palmarès en image**.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre la question, les réponses à lire et les scores, jamais les mains.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo** et la partie continue.
- **Mon profil** (sur l'accueil du jeu) : tes stats gardées sur ton téléphone (parties, victoires, manches gagnées, ta carte qui gagne le plus, ton titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de réseau ? **Jouer à plusieurs sur un seul téléphone** : le téléphone passe de main en main, avec un juge à chaque manche.

## Secret des mains

Les règles Firebase font que chaque joueur ne peut lire que **sa** main et **ses** cartes jouées, même en fouillant dans le navigateur.
On ne peut jouer qu'une carte de sa propre main, et le juge ne peut pas jouer.
Seul le téléphone du modo connaît toutes les mains et qui a joué quoi, parce que c'est lui qui distribue. L'appli ne le lui montre pas avant le résultat, mais un modo tricheur pourrait le trouver avec les outils de développement.
