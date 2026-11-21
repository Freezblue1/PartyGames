# Undercover

Même principe que « Qui de nous… » : un site statique (HTML/JS) branché sur Firebase.
Undercover utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `ucRooms`.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu |
| `words.js` | Les paires de mots, par thème (Classique, Soirée, Hot, Bouffe, Voyages, Écrans & réseaux, Sport, Ciné & séries) |
| `gages.js` | Les gages et vérités, par niveau (Soft → Extrême) |
| `style.css` | Le style |
| `config.js` | La config Firebase (déjà remplie, la même que Qui de nous) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères.
- Les autres scannent le **QR code**, ouvrent le lien d'invitation, ou tapent le code. Il faut au moins 3 joueurs.
- Le modo choisit les thèmes de mots, le nombre d'Undercover, Mr White (dès 4 joueurs, avec ou sans Undercover), si les indices sont écrits ou dits à voix haute, et les **gages et vérités** (avec leur niveau).
- **Mots maison** : chacun peut proposer ses paires. Seuls l'auteur et le modo les voient ; le modo les valide, et elles forment le thème « Ce groupe », tiré en priorité.
- Chacun voit son mot en appuyant sur **Voir mon mot**. Il se recache tout seul après quelques secondes.
- Les votes se révèlent **tout seuls** quand tous les joueurs encore connectés ont voté (le modo garde « Révéler maintenant »).
- **Carnet de soupçons** : pendant la partie, touche un joueur pour le marquer « suspect » ou « sûr ». Personne d'autre ne le voit.
- À la fin : les rôles, un **titre** pour chacun (Sherlock, Menteur pro, Mouton…), les gages des perdants, le classement, et un bouton pour **partager le résultat en image**.
- **Grand écran** : dans « Code de la partie », le modo trouve un lien à ouvrir sur une TV ou un ordi. Il montre le QR code, les indices, les votes et les rôles révélés, jamais les mots secrets.
- **Passer la main** : le modo peut donner son rôle à quelqu'un d'autre, même en pleine partie. S'il perd la connexion plus d'une minute, les autres peuvent **devenir le modo**.
- **Mon profil** (sur l'accueil du jeu) : tes stats gardées sur ton téléphone (parties, victoires, rôles joués, titre fétiche…).
- **Installer l'appli** : bouton sur l'accueil (Android), ou Partager › « Sur l'écran d'accueil » (iPhone).
- Les parties créées sur ton téléphone et inutilisées depuis 24 h sont supprimées toutes seules de Firebase.
- Pas de réseau ou envie de faire simple ? **Jouer à plusieurs sur un seul téléphone** : le téléphone passe de main en main.

## Secret des mots

Les règles Firebase font que chaque joueur ne peut lire que **son** mot (et ses propres mots maison), même en fouillant dans le navigateur.
Seul le téléphone du modo connaît tous les rôles et toutes les paires proposées, parce que c'est lui qui distribue et valide. L'appli ne lui montre pas les rôles, mais un modo tricheur pourrait les trouver avec les outils de développement.
