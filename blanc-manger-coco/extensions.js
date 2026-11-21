/* Les paquets à thème, à ajouter au paquet de base dans les réglages. Même format que cards.js :
   par niveau (1 Soft, 2 Piquant, 3 Trash, 4 Extrême), un niveau pouvant manquer. À modifier librement. */
export const EXTENSIONS = [
  {
    id: "soiree", name: "Soirée & apéro", desc: "Boîtes de nuit, jeux à boire et lendemains qui piquent",
    q: {
      1: [
        "Le seul truc qui sauve une soirée ratée : ___.",
        "La playlist de la soirée, c'est 100 % ___.",
        "À 4 h du matin, il ne reste plus que ___.",
        "Le dress code de l'anniversaire : venez déguisés en ___.",
        "Ce qu'on a mangé à l'after : ___."
      ],
      2: [
        "Je me suis réveillé dans la baignoire avec ___.",
        "La règle du jeu à boire : celui qui parle ___ boit cul sec.",
        "Ma story de la soirée : moi, un gobelet et ___.",
        "Le videur m'a laissé entrer grâce à ___.",
        "Ce qui a vraiment fini dans le punch : ___.",
        "Le meilleur moyen de pécho en boîte : ___.",
        "Le cocktail de la soirée : rhum, glaçons et ___.",
        "On m'a retrouvé à 6 h du matin en train de danser avec ___.",
        "Le meilleur moment de la soirée : ___. Le pire : ___."
      ],
      3: [
        "Ce qu'on a retrouvé dans les toilettes de la boîte : ___.",
        "Le lendemain, j'avais ___ tatoué sur la fesse.",
        "Ma technique pour vomir discrètement : ___.",
        "Ce qui a fini dans la bouteille vide : ___.",
        "Le pire endroit pour finir la soirée : ___.",
        "J'ai pécho ___ et je ne regrette rien."
      ],
      4: [
        "Ce qui s'est passé dans la chambre des manteaux : ___.",
        "Au réveil, j'avais ___ dans la bouche et aucun souvenir."
      ]
    },
    a: {
      1: [
        "un gobelet en plastique fondu", "le dernier métro", "un karaoké de ballades des années 90", "une enceinte sans batterie",
        "les chips au paprika", "un voisin qui appelle la police", "une danse en ligne", "une partie de bière-pong truquée",
        "une guirlande lumineuse", "le pote qui dort dès 22 h", "un déguisement de banane", "un pack de bières tièdes",
        "la pizza froide du matin", "le gars qui veut toujours changer la musique", "une piñata remplie de saucisson"
      ],
      2: [
        "un shot de liqueur aux herbes", "le slow avec la mauvaise personne", "un bisou dans le vestiaire", "un ex qui débarque sans prévenir",
        "un SMS « t'es où ? » à 4 h", "une gueule de bois à la tequila", "un concours de shots", "le punch au rhum de tonton",
        "une drague avec une glace à l'eau", "le canapé qui sert de lit", "un trou noir complet", "le vigile qui fait la morale",
        "un taxi qui refuse de nous prendre", "une soirée qui finit au commissariat", "une danse collé-serré"
      ],
      3: [
        "un vomi dans le sac à main", "un pipi dans le lavabo", "une capote gonflée en ballon", "un string retrouvé dans le congélateur",
        "un plan cul dans la salle de bain de l'hôte", "des toilettes bouchées à minuit", "un pote qui fait pipi dans le placard",
        "une gerbe dans la piscine gonflable", "un bisou au goût de clope et de kebab", "un réveil à côté d'une flaque de vomi"
      ],
      4: [
        "une partouze dans la chambre des manteaux", "un plan à trois sur la pile de manteaux", "une diarrhée dans la douche de l'hôte",
        "un préservatif dans le bol de chips", "un orgasme sur la machine à laver en marche"
      ]
    }
  },
  {
    id: "boulot", name: "Boulot", desc: "Open space, réunions et pots de départ",
    q: {
      1: [
        "Le nouveau rituel du lundi matin au bureau : ___.",
        "Mon entretien d'embauche a dérapé. Le coupable : ___.",
        "Le cadeau de départ du patron : ___.",
        "Ma vraie compétence pour le poste : ___.",
        "Nouveau à l'open space : ___ en libre-service.",
        "Le thème du séminaire cette année : ___.",
        "L'ordre du jour de la réunion de 9 h : ___.",
        "Ce que j'ai vraiment fait pendant le télétravail : ___.",
        "Le prix de l'employé du mois : ___."
      ],
      2: [
        "Ce que j'ai trouvé dans le tiroir du patron : ___.",
        "Le vrai sujet du pot de départ : ___.",
        "Au team building, on a fini avec ___.",
        "La raison de mon arrêt maladie : ___.",
        "Ce que je pense vraiment de mon boss : ___.",
        "Ce qui m'a valu un rendez-vous avec les RH : ___."
      ],
      3: [
        "Vingt minutes dans les toilettes du bureau, et à la fin : ___.",
        "La visio a planté pile au moment où on voyait ___.",
        "Le stagiaire a laissé ___ dans le frigo commun.",
        "Au séminaire, le directeur a fini la nuit avec ___."
      ],
      4: [
        "Ce qu'on a retrouvé dans la salle de réunion le lendemain du pot : ___.",
        "Ma lettre de démission tenait en un mot : ___."
      ]
    },
    a: {
      1: [
        "un fichier de tableur de 3 000 lignes", "la machine à café en panne", "un tableau croisé dynamique", "le stagiaire",
        "un séminaire en Auvergne", "un mail « Répondre à tous »", "le badge oublié", "une réunion sur les réunions",
        "un diaporama animé", "le chef de projet en trottinette", "un post-it jaune fluo", "les tickets restaurant",
        "une plante verte morte", "le mot « synergie »", "un brainstorming de quatre heures", "la pause clope de 45 minutes",
        "une augmentation de 12 euros", "le DRH en chemise hawaïenne"
      ],
      2: [
        "un pot de départ qui dégénère", "la secrétaire et le directeur", "un arrêt maladie au soleil",
        "le collègue qui fait réchauffer du poisson", "un séminaire avec karaoké", "une visio en caleçon", "le patron bourré au séminaire",
        "une rupture conventionnelle", "un burn-out de luxe", "un CV entièrement inventé", "un afterwork qui finit à 5 h",
        "le collègue trop tactile", "la note de frais du séminaire"
      ],
      3: [
        "un caca nerveux avant l'entretien annuel", "un plan cul dans la salle de reprographie", "les toilettes du troisième étage",
        "un pet en pleine visio, micro allumé", "un string sur le bureau du patron", "un nude envoyé sur la messagerie de la boîte",
        "une photocopie de fesses affichée en salle de pause"
      ],
      4: [
        "une partouze dans la salle du conseil d'administration", "un plug vibrant pendant l'entretien annuel",
        "une diarrhée dans les toilettes de la direction", "une branlette sous le bureau en visio"
      ]
    }
  },
  {
    id: "famille", name: "Famille", desc: "Repas de Noël, belle-famille et vacances au camping",
    q: {
      1: [
        "Le sujet qui fâche au repas de Noël : ___.",
        "Mamie a offert ___ à tout le monde.",
        "Le plat signature de tata : ___.",
        "Ce que papa cache dans le garage : ___.",
        "Le surnom de mon cousin, et personne ne sait pourquoi : « ___ ».",
        "L'héritage de tonton : une maison, une voiture et ___.",
        "Le grand jeu du réveillon : ___.",
        "Les vacances en famille, c'est surtout ___."
      ],
      2: [
        "Ce que mon père a trouvé dans mon historique : ___.",
        "Le cadeau gênant de la belle-mère : ___.",
        "Au mariage de ma sœur, j'ai fait tout mon discours sur ___.",
        "La vraie raison de la brouille familiale : ___.",
        "Mamie a découvert ___ sur Internet. Elle ne s'en remet pas.",
        "Ce que ma mère a dit à mon ex : « Bon courage avec ___. »"
      ],
      3: [
        "Ce que papi a laissé dans la piscine gonflable : ___.",
        "Ce qu'on a trouvé dans la salle de bain de tonton : ___.",
        "Le pire bruit au repas du dimanche : ___.",
        "L'odeur dans la voiture pendant le trajet des vacances : ___."
      ]
    },
    a: {
      1: [
        "le gratin de mamie", "un album photo de mon adolescence", "le cousin qui fait de la magie", "la belote du dimanche",
        "une dispute sur la politique", "le chien de tata", "les vacances au camping de Palavas", "un pull tricoté main",
        "la bûche glacée", "les photos de mes premiers pas", "papi qui triche au Scrabble", "le fauteuil de papi, interdit à tous",
        "un apéro qui dure jusqu'au dessert", "la cousine qui chante", "un barbecue avec 40 cousins", "un repas de six heures",
        "une chenille au mariage"
      ],
      2: [
        "le nouveau copain de ma mère", "la tante qui abuse du kir", "un secret de famille", "le beau-frère qui drague tout le monde",
        "un test ADN surprise", "la belle-mère qui débarque sans prévenir", "le cousin en prison", "mes parents qui s'embrassent à table",
        "un faire-part de divorce", "le testament contesté"
      ],
      3: [
        "le dentier de mamie dans la purée", "les pets de papi pendant la messe", "la couche de tonton", "les hémorroïdes de tata, à table",
        "un rot de tonton pendant le bénédicité", "papi tout nu dans le jardin", "la culotte de mamie sur le séchoir",
        "une diarrhée sur l'aire d'autoroute"
      ]
    }
  },
  {
    id: "sansfiltre", name: "Sans filtre", desc: "Le paquet le plus trash : cul, caca et zéro limite. Niveau Trash ou Extrême",
    q: {
      3: [
        "Mon dernier plan cul m'a laissé ___ en souvenir.",
        "Ce que je fais pendant que ma moitié dort : ___.",
        "La meilleure excuse pour ne pas faire l'amour ce soir : ___.",
        "Le cadeau parfait pour un enterrement de vie de garçon : ___.",
        "Ce qu'on a trouvé sous le lit de l'hôtel : ___.",
        "Pendant l'amour, je pense toujours à ___.",
        "Mon talent caché au lit : ___.",
        "Ce qui me coupe toute envie au lit : ___.",
        "Ma liste de courses au sex-shop : ___ et ___.",
        "Ce qui gratte depuis mon week-end à Amsterdam : ___.",
        "La nouvelle saveur de lubrifiant : ___.",
        "Ce que j'ai vu par le trou de la serrure : ___."
      ],
      4: [
        "Ce que j'avalerais pour 100 euros : ___.",
        "Ma dernière coloscopie a révélé ___.",
        "Le petit nom de mon sextoy préféré : « ___ ».",
        "Le pire truc à trouver dans son slip au réveil : ___.",
        "Ce qui a fait évacuer la piscine municipale : ___.",
        "J'ai filmé ___ et je l'ai posté par erreur.",
        "Ma position préférée : ___ façon ___.",
        "Ce qui sent le plus fort dans mes toilettes : ___.",
        "Le meilleur ami de mon anus : ___.",
        "Ce qui m'a fait jouir le plus vite : ___.",
        "Ma mère a trouvé ___ dans le lave-linge. Elle a tout compris.",
        "Le dernier truc que j'ai sorti de mon nombril : ___.",
        "L'orgasme de l'année est décerné à ___.",
        "La vraie recette de la sauce blanche : ___.",
        "Après le concombre, j'ai essayé ___.",
        "Au lit, ma moitié m'appelle « ___ ».",
        "Le parfum de ma culotte du dimanche : ___.",
        "Ce qui est resté collé au plafond : ___."
      ]
    },
    a: {
      3: [
        "un vibromasseur de voyage", "des menottes perdues sans la clé", "une caméra cachée dans la chambre", "un string en dentelle pour homme",
        "un plan cul qui parle de son ex", "une capote XXL beaucoup trop grande", "des préliminaires de trois secondes",
        "un orgasme bruyant à travers la cloison", "un massage à l'huile qui glisse", "une fessée un peu trop forte",
        "des boules de geisha oubliées", "un cunni de vingt minutes", "le Kamasutra version gainage", "une nuit dans un love hôtel à Pigalle",
        "un sex-shop ouvert jour et nuit", "une soirée latex", "une sextape mal cadrée", "un pyjama en pilou découpé aux bons endroits",
        "un plan à trois qui tourne au débat politique", "un godemiché retrouvé par la femme de ménage", "un préservatif à la menthe",
        "un lit qui grince comme une porte de grange", "un éternuement en plein orgasme", "un tue-l'amour en chaussettes",
        "une sieste crapuleuse", "une épilation du dos à la cire", "un body en résille", "un massage des pieds qui dérape"
      ],
      4: [
        "une poire à lavement", "un godemiché double", "un plug à queue de renard", "une cage de chasteté", "un fouet en réglisse",
        "une partouze en combinaison de ski", "un trio dans un photomaton", "une éjaculation qui atteint le plafond",
        "une crotte dans le jacuzzi", "un pet mouillé", "un slip kangourou jauni", "une serviette hygiénique collée au dos",
        "un sextoy avalé par erreur", "un poil pubien dans le café", "une branlette avec des gants de vaisselle",
        "une langue qui sent les pieds", "du vomi dans le jacuzzi", "une capote pleine qui traîne sur le parquet",
        "une sodomie avec de l'huile d'olive", "une fellation au goût de fromage", "un caca sur une aire d'autoroute sans papier",
        "une levrette sur le capot d'une voiture de police", "un orgasme en pleine coloscopie", "un pénis coincé dans une fermeture éclair",
        "des testicules qui touchent l'eau des toilettes", "une diarrhée en combinaison de ski", "un gros pet sous la douche à deux",
        "des selles en forme de cœur", "un string mangé par les fesses", "une pipe pendant une tempête de neige", "un clystère au café",
        "un pet qui éteint une bougie", "la morve du siècle", "un lubrifiant périmé depuis 2009", "une odeur de cul en open space"
      ]
    }
  }
];
