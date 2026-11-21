# Qui de nous…

Le jeu est un site statique (HTML/JS) qui utilise Firebase pour la partie en direct :
Firestore garde les parties et les votes, l'authentification anonyme donne un identifiant à chaque téléphone.
Personne n'a besoin de créer de compte pour jouer.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu |
| `q1.js` … `q4.js` | Les questions, 300 par niveau (1 Normal → 4 Extrême) — à modifier librement |
| `questions.js` | Rassemble les quatre fichiers de questions |
| `gages.js` | Les gages et vérités, par niveau |
| `style.css` | Le style |
| `config.js` | La config du projet Firebase |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Ce qui permet d'installer le jeu comme une appli |

Les thèmes (Boulot, Soirées…) sont trouvés automatiquement à partir des mots de chaque question :
une nouvelle question rejoint toute seule le bon thème.

Grand écran : le modo trouve dans « Code de la partie » un lien qui finit par `-tv`.
Ouvert sur une TV ou un ordi, il montre la partie sans y jouer.

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères.
- Les autres ouvrent le lien d'invitation (bouton *Inviter* ou *Copier le lien*), ou tapent le code.
- Le modo règle le niveau et le nombre de questions, révèle les votes et passe à la suite.
- Un modo qui recharge sa page sur le même téléphone retrouve sa partie et ses droits.

## Coût

Le forfait gratuit de Firebase (Spark) suffit largement pour des soirées entre amis.
