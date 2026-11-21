# Kems

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Le Kems utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `kmRooms`.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu (distribution, échanges simultanés, Kems et Contre, lettres) |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême), les mêmes que le Poker et le Perudo |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo, et son téléphone fait le donneur. Elle reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. Jusqu'à 10 joueurs.
- Le modo choisit :
  - **Équipes de 2** (la vraie règle, 4 joueurs ou plus, en nombre pair) ou **Chacun pour soi** (dès 2, même en nombre impair) ;
  - les **équipes** : « Mélanger les équipes », ou toucher deux joueurs pour les échanger. Les partenaires s'assoient face à face ;
  - les **signes tirés au sort** : chaque équipe reçoit un signe secret (se gratter le nez, hausser les sourcils…), affiché seulement sur les téléphones des deux partenaires ;
  - **pour gagner** : écrire KEMS (4 manches gagnées), KEMS KEMS (8), ou sans fin ;
  - quand les **nouvelles cartes** arrivent au milieu : après 8 ou 15 s sans échange, ou seulement quand tout le monde a appuyé sur « Rien pour moi » ;
  - le **jeu de 32 cartes** (du 7 à l'as, jusqu'à 6 joueurs) : les carrés tombent plus vite ;
  - les **gages et vérités** pour l'équipe qui a le moins de lettres, avec des **gages maison**, et le **mode apéro** (l'équipe qui perd la manche boit).
- Chacun voit **ses 4 cartes sur son téléphone**, et seulement les siennes. Les 4 cartes du milieu sont sur tous les téléphones (et sur le grand écran).
- 5 secondes pour regarder sa main, puis le milieu se retourne et **tout le monde échange en même temps** : on touche une de ses cartes, puis une carte du milieu. Le premier arrivé prend la carte ; les autres voient « Trop tard ! ».
- **Rien pour moi** : quand tous les joueurs présents passent, 4 nouvelles cartes arrivent. Le modo peut aussi en remettre à la main.
- **KEMS !** : ton partenaire a fait son signe, tu annonces son carré (deux touches, pour éviter les fausses manips). **CONTRE !** : tu désignes un adversaire qui a un carré.
- Juste : ton équipe écrit une lettre. Faux : à deux équipes, c'est l'autre qui l'écrit ; à plus, ton équipe perd une lettre.
- À la fin de chaque manche, tout le monde voit la main annoncée et toutes les autres, avec les carrés que personne n'a vus.
- À la fin : le classement, un **titre** pour chacun (Éclair, Télépathe, Œil de lynx, Le Mime, Grillé, Signal brouillé, Parano…), le détail de sa partie, et un bouton pour **partager le classement en image** avec le coup de la soirée.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre le milieu en grand, les lettres et les résultats, jamais les mains.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo** et la partie continue.
- **Mon profil** (sur l'accueil) : ta couleur, et tes stats gardées sur ton téléphone (parties, victoires, Kems et contres réussis, titre fétiche).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de mode « un seul téléphone » : au Kems, tout le monde échange en même temps avec sa main cachée. Sans réseau, sortez un vrai paquet !

## Comment marchent les échanges

Personne n'écrit directement sur la table. Chaque échange, Kems ou Contre est un petit message horodaté par le serveur.
Le téléphone du modo les applique dans l'ordre d'arrivée, plusieurs d'un coup s'il le faut : c'est lui qui départage deux joueurs qui visent la même carte.
Compte environ une demi-seconde entre ta touche et la confirmation ; en attendant, la carte s'affiche déjà dans ta main, en grisé.
Le téléphone du modo doit donc rester allumé et sur la page (l'appli empêche la mise en veille pendant la partie).

## Secret des cartes

Les règles Firebase font que chaque joueur ne peut lire que **ses** quatre cartes et le signe de **son** équipe, même en fouillant dans le navigateur.
Un joueur ne peut échanger ou annoncer que pour lui-même, pendant la manche, et rien ne peut être modifié ensuite.
Seul le téléphone du modo connaît toutes les mains, parce que c'est lui qui distribue. L'appli ne lui montre rien, mais un modo tricheur pourrait les trouver avec les outils de développement.
