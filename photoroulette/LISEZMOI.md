# Photo Roulette

Même principe que « Qui de nous… », « Undercover » et « Loup-Garou » : un site statique (HTML/JS) branché sur Firebase.
Photo Roulette utilise **le même projet Firebase** (`qui-de-nous-7244f`) : ses parties sont rangées à part, dans la collection `prRooms`.
Personne n'a besoin de créer de compte pour jouer.

Les photos sont réduites sur le téléphone (1280 px max, JPEG) puis rangées **directement dans Firestore**, une par document.
Pas besoin de Firebase Storage (qui demande maintenant le forfait payant) : le forfait gratuit Spark suffit.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `app.js` | Toute la logique du jeu (envoi des photos, votes, chrono, points) |
| `style.css` | Le style : chambre noire et photos instantanées |
| `config.js` | La config Firebase (déjà remplie, la même que les autres jeux) |

> Mise en ligne et règles Firebase : voir le [LISEZMOI à la racine](../LISEZMOI.md).
> Compte, couleur, groupes, sauvegardes et « Revoir » : communs à tous les jeux, voir aussi le LISEZMOI à la racine.
> Connecté, tu joues sous ton pseudo de compte et ta couleur choisie dans « Mon compte ».

## Jouer

- Une personne clique **Créer une partie** : elle devient le modo et reçoit un code à 4 caractères. Les autres ouvrent le lien d'invitation ou tapent le code. Il faut au moins 3 joueurs avec des photos.
- Le modo choisit le nombre de photos par joueur (3, 5, 8 ou 10) et le chrono (sans, 10, 15, 20 ou 30 secondes).
- Chacun met le plus de photos possible dans **la roulette**, et le jeu en tire le bon nombre **au hasard**. Personne ne sait lesquelles, pas même leur propriétaire. Seules les photos tirées sont envoyées : on peut en mettre des milliers sans rien consommer de plus.
  - Un site web n'a pas le droit d'ouvrir la galerie tout seul (seule une appli installée le peut). L'écran explique donc comment en prendre un maximum d'un coup, selon le téléphone :
  - **Android** (et ordinateur) : **Prendre un dossier entier**, de préférence DCIM › **Camera** (ses sous-dossiers comptent aussi), si le navigateur du téléphone le permet. Le téléphone n'accepte qu'un dossier à la fois, mais on en ajoute autant qu'on veut l'un après l'autre (**Ajouter un autre dossier** : Pictures…). L'écran liste les dossiers dans la roulette avec leur nombre de photos, et on peut en retirer un. Sinon, appui long sur une photo puis glisser le doigt.
  - **iPhone** : Photothèque, poser le doigt sur une photo et glisser vers le bas pour en cocher des centaines.
  - **Accès direct aux dossiers** (Chrome sur Android 132 ou plus récent, Chrome et Edge sur ordinateur ; pas l'iPhone) : **Prendre un dossier entier** demande l'autorisation de lire le dossier, puis le jeu y repère les photos par leur nom seulement. Le téléphone ne prépare plus tous les fichiers, et seules les photos tirées au sort sont ouvertes. Les dossiers cachés de miniatures sont sautés : DCIM en entier ne ralentit plus rien. Le compte de photos trouvées monte à l'écran et on peut **arrêter en route** (le tirage se fait parmi celles déjà trouvées). Les dossiers sont retenus sur le téléphone : à la partie suivante, **Reprendre mes dossiers** les relit en un toucher (le téléphone peut redemander l'autorisation). Sur les autres navigateurs, le bouton garde l'ancien fonctionnement.
  - **Pourquoi c'est parfois long** : entre le choix et l'arrivée des photos dans la page, c'est le téléphone qui travaille, et la page ne peut pas l'accélérer. Sur Android, il fait la liste de tout le dossier (vidéos et miniatures cachées comprises : DCIM en entier est bien plus lent que DCIM › Camera). Sur iPhone, il convertit chaque photo choisie et télécharge d'abord celles qui ne sont que sur iCloud (200 à 300 photos suffisent pour une bonne roulette). Pendant ce temps, l'écran affiche « Ton téléphone rassemble tes photos » avec le temps écoulé.
  - Ensuite, la réduction des photos tirées se fait en arrière-plan (l'écran ne fige pas) et la photo suivante se prépare pendant que la précédente s'envoie. Pendant la partie, chaque téléphone télécharge deux photos d'avance.
  - On peut rajouter des photos à tout moment avant le début (ça relance le tirage), **relancer la roulette**, jeter un œil et **retirer** une photo (elle sort de la roulette et elle est remplacée).
  - À la partie suivante, la roulette garde la sélection de chacun et ne ressort pas les photos déjà jouées.
  - Les fichiers illisibles (vidéos, certains HEIC sur Android) sont sautés automatiquement.
- Une photo s'affiche sur tous les téléphones, chacun vote pour la personne à qui elle appartient. Le propriétaire voit discrètement « c'est la tienne » : il vote pour quelqu'un d'autre pour brouiller les pistes, son vote ne compte pas.
- La photo se révèle toute seule quand tout le monde a voté ou à la fin du chrono (le modo peut aussi révéler tout de suite). Bonne réponse : 100 points, plus jusqu'à 50 points de bonus de rapidité.
- Touche une photo pour la voir en plein écran.
- À la fin : classement, trophées (Éclair, Livre ouvert, Agent secret) et la galerie de la partie. Les points s'additionnent d'une partie à l'autre.

## Secret des photos

- Les règles Firebase font que **personne ne peut savoir à qui est une photo avant qu'elle soit dévoilée**, même en fouillant dans le navigateur, et même le modo : le lien photo → propriétaire n'est lisible que par le propriétaire, puis par tout le monde une fois la photo révélée. Pendant une partie, le modo ne peut ni changer le paquet ni dévoiler une autre photo que celle en cours.
- Seule faille possible pour un modo vraiment tricheur : regarder avec les outils de développement **à quel moment** chaque photo arrive pendant la préparation.
- En repassant par le téléphone, chaque photo perd sa position GPS et ses autres métadonnées.
- **Les photos sont effacées du serveur à la fin de chaque partie.** Chaque téléphone garde seulement celles qu'il a vues, pour la galerie de fin, jusqu'à la partie suivante.
- Si une partie est abandonnée avant la fin, ses photos restent sur le serveur. Elles sont effacées dès que le modo relance une partie dans le même salon, ou quand leur propriétaire revient dans le salon.

## Coût

Chaque photo est réduite à 1080 px et pèse environ 100 à 300 Ko. Une soirée à 8 joueurs avec 5 photos chacun représente environ 100 Mo de téléchargement au total : le forfait gratuit (10 Go par mois) permet des dizaines de parties.
