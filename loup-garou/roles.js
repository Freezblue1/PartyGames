// Les cartes du jeu et leurs explications, d'après la règle officielle des Loups-Garous de Thiercelieux
// (https://www.regledujeu.fr/loup-garou-regle/). camp : "village", "wolf" ou "solo".
// BASE = les cartes de la boîte de base ; EXPANSIONS = personnages des extensions, hors règle de base.
export const ROLES = {
  wolf: {
    name: "Loup-Garou", plural: "Loups-Garous", icon: "🐺", camp: "wolf",
    short: "Chaque nuit, dévore un villageois avec ta meute.",
    goal: "Éliminer jusqu'au dernier villageois.",
    power: "Chaque nuit, les Loups-Garous ouvrent les yeux, se reconnaissent et se mettent d'accord en silence sur une victime. S'ils n'arrivent pas à se décider, il n'y a pas de mort cette nuit. Le jour, ils se font passer pour d'honnêtes villageois et votent comme tout le monde.",
    app: "La nuit, tu vois les autres loups et leurs votes en direct. Il faut que toute la meute vote pour la même personne : tant que vous n'êtes pas d'accord, la nuit continue. Si le meneur arrête d'attendre avant que vous soyez d'accord, personne n'est dévoré.",
    tips: ["Ne défends pas trop ouvertement un autre loup.", "Accuse quelqu'un de temps en temps, comme le ferait un vrai villageois.", "Repérer la Voyante et la Sorcière, c'est la moitié de la victoire."]
  },
  villager: {
    name: "Simple Villageois", plural: "Simples Villageois", icon: "🧑‍🌾", camp: "village",
    short: "Pas de pouvoir, mais ta voix compte.",
    goal: "Éliminer le dernier Loup-Garou.",
    power: "Il n'a aucun pouvoir particulier : ses seules armes sont sa capacité d'analyse du comportement des autres et sa force de persuasion. C'est la force du nombre qui fait gagner le village.",
    app: "La nuit, tu dors : garde les yeux fermés pendant que le meneur appelle les rôles un par un. Le jour, ta voix compte autant que celle des autres.",
    tips: ["Observe qui vote avec qui, et qui change d'avis au dernier moment.", "Fais parler ceux qui se taisent.", "Tu peux bluffer : prétendre être la Voyante attire parfois les loups… sur toi."]
  },
  seer: {
    name: "Voyante", icon: "🔮", camp: "village",
    short: "Chaque nuit, découvre la vraie carte d'un joueur.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Chaque nuit, elle se réveille la première, désigne un joueur et découvre sa carte. Elle doit aider le village sans se faire démasquer par les loups.",
    app: "La nuit, touche un joueur : sa carte s'affiche aussitôt sur ton écran. Tes découvertes restent notées sous ta carte.",
    tips: ["Ne te dévoile pas trop tôt, les loups te viseraient.", "Oriente les votes avec subtilité plutôt qu'en criant « je sais ! ».", "Si tu vas mourir, c'est le moment de tout dire."]
  },
  witch: {
    name: "Sorcière", icon: "🧪", camp: "village",
    short: "Une potion pour sauver, une potion pour tuer.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Elle connaît deux potions très puissantes, utilisables une seule fois chacune dans la partie : une potion de guérison, pour ressusciter la victime des loups, et une potion d'empoisonnement, pour éliminer un joueur la nuit. Elle ne peut utiliser qu'une seule potion par nuit (règle de l'appli : la règle officielle permet les deux). Elle peut se guérir elle-même si les loups viennent de l'attaquer.",
    app: "Après les loups, ton téléphone te montre leur victime. Tu choisis de la sauver, d'empoisonner quelqu'un, ou rien du tout : une seule potion par nuit.",
    tips: ["Garder la potion de guérison pour sauver la Voyante peut changer la partie.", "La potion d'empoisonnement sur un innocent, c'est un cadeau aux loups : sois sûre de toi."]
  },
  hunter: {
    name: "Chasseur", icon: "🏹", camp: "village",
    short: "En mourant, il emporte quelqu'un avec lui.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "S'il se fait dévorer par les loups ou éliminer par le village, le Chasseur doit répliquer avant de rendre l'âme : il élimine immédiatement le joueur de son choix.",
    app: "Dès que tu es éliminé, ton téléphone te demande ta cible. Tout le monde attend ton tir.",
    tips: ["Les loups hésitent à t'attaquer : tu peux te révéler pour te protéger du vote.", "Garde tes soupçons en tête : ton tir peut être décisif."]
  },
  cupid: {
    name: "Cupidon", icon: "💘", camp: "village",
    short: "La première nuit, il rend deux joueurs amoureux.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "La première nuit, il désigne deux joueurs qui seront amoureux jusqu'à la fin de la partie (il peut se désigner lui-même). Ensuite, c'est un simple villageois.",
    app: "La première nuit, touche deux joueurs puis valide. Les amoureux l'apprennent sur leur téléphone, mais ne découvrent pas la carte de l'autre.",
    tips: ["Lier deux joueurs au hasard crée souvent le chaos… c'est le but.", "Si un amoureux meurt, l'autre meurt aussi : ça peut emporter un loup !"]
  },
  girl: {
    name: "Petite Fille", icon: "👧", camp: "village",
    short: "Elle espionne les loups… au péril de sa vie.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Pendant le tour des loups, elle peut entrouvrir les yeux pour les espionner. Si les loups la surprennent, ils changent d'avis : elle meurt à la place de la victime qu'ils avaient choisie.",
    app: "Chaque nuit, tu choisis d'espionner ou non. Si tu espionnes, tu découvres le nom d'un des loups. Mais une fois sur trois, les loups te surprennent : ils l'apprennent, et c'est toi qu'ils dévorent à la place de leur victime.",
    tips: ["Espionner une ou deux fois suffit souvent.", "Si tu sais qui est loup, trouve comment le faire comprendre au village sans te trahir."]
  },
  thief: {
    name: "Voleur", icon: "🦹", camp: "village",
    short: "Avant la première nuit, il peut voler une des deux cartes du centre.",
    goal: "Gagner avec le camp de la carte qu'il a en main.",
    power: "Quand le Voleur est en jeu, on ajoute deux cartes Simple Villageois au paquet : les deux cartes en trop restent au centre, face cachée. Au tout début de la première nuit, le Voleur les regarde et peut échanger sa carte contre l'une d'elles. Il joue alors ce personnage jusqu'à la fin de la partie. Si les deux cartes sont des Loups-Garous, il est obligé d'en prendre une. S'il garde sa carte, il joue comme un simple villageois.",
    app: "Avant la première nuit, ton téléphone te montre les deux cartes du centre. Prends-en une, ou garde la tienne. Ta nouvelle carte s'affiche aussitôt, et tu joues ce rôle dès cette nuit (si tu deviens loup, la meute le découvre en se réveillant).",
    tips: ["Prendre la Voyante ou la Sorcière est tentant… mais prendre un loup change tout l'équilibre !", "Personne ne sait quelles cartes étaient au centre : tu peux bluffer là-dessus."]
  },
  guard: {
    name: "Salvateur", icon: "🛡️", camp: "village", expansion: true,
    short: "Chaque nuit, protège un joueur des loups.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Personnage d'extension. Chaque nuit, il protège un joueur de l'attaque des loups. Il peut se protéger lui-même, mais jamais la même personne deux nuits de suite. Sa protection n'arrête pas la potion de la Sorcière.",
    app: "La nuit, touche le joueur à protéger. Celui de la nuit d'avant est grisé.",
    tips: ["Protéger la Voyante démasquée est souvent le meilleur choix.", "Change de cible : les loups essaient de deviner ton schéma."]
  },
  elder: {
    name: "Ancien", icon: "👴", camp: "village", expansion: true,
    short: "Coriace : il survit à la première attaque des loups.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Personnage d'extension. Il survit à la première attaque des loups ; la deuxième lui est fatale. Le vote du village, la Sorcière ou le Chasseur le tuent directement.",
    app: "Rien à faire de spécial : si les loups t'attaquent une première fois, personne ne meurt cette nuit-là. Toi seul sais pourquoi.",
    tips: ["Survivre à une attaque te rend crédible : tu sais qu'un loup te vise.", "Ne le dis pas trop vite, les loups reviendraient."]
  },
  idiot: {
    name: "Idiot du village", icon: "🤪", camp: "village", expansion: true,
    short: "Voté par le village, il est épargné… mais ne vote plus.",
    goal: "Aider le village à éliminer le dernier Loup-Garou.",
    power: "Personnage d'extension. Si le village vote contre lui, il révèle sa carte et on l'épargne : on ne pend pas un idiot ! Mais il perd son droit de vote pour le reste de la partie. Les loups, eux, peuvent le dévorer normalement.",
    app: "Si le village t'élimine, l'appli révèle ta carte et tu restes en jeu, sans pouvoir voter.",
    tips: ["Tu peux attirer les soupçons exprès : ça fait perdre un tour aux villageois… mais aussi aux loups.", "Même sans vote, tu peux encore parler."]
  },
  angel: {
    name: "Ange", icon: "👼", camp: "solo", expansion: true,
    short: "Il gagne seul s'il se fait éliminer au premier vote.",
    goal: "Se faire éliminer par le village au tout premier vote. S'il rate, il rejoint le camp du village.",
    power: "Personnage d'extension. Si le village l'élimine lors du premier vote (le premier jour), la partie s'arrête aussitôt : l'Ange monte au ciel et gagne seul. S'il survit à ce vote, ou s'il meurt autrement (dévoré la première nuit, flèche du Chasseur, chagrin d'amour…), c'est raté : il devient un simple villageois et gagne avec le village.",
    app: "La nuit, tu dors comme les villageois. Le premier jour, à toi de paraître louche… L'appli arrête la partie toute seule si le village tombe dans le piège.",
    tips: ["Avoir l'air suspect sans en faire trop : un Ange trop évident, personne ne vote contre lui.", "Villageois : méfiez-vous de celui qui a l'air de vouloir être éliminé dès le premier jour !"]
  }
};
ROLES.whitewolf = {
  name: "Loup Blanc", icon: "🐺", camp: "solo", expansion: true,
  short: "Un loup qui joue seul : une nuit sur deux, il dévore un autre loup.",
  goal: "Être le tout dernier survivant du village.",
  power: "Personnage d'extension. Le Loup Blanc se réveille avec les autres loups, qui le prennent pour l'un des leurs, et vote avec eux. Mais une nuit sur deux (les nuits paires), il se réveille seul et peut dévorer un Loup-Garou. Il gagne seul s'il est le dernier en vie.",
  app: "Tu vois la meute et votes avec elle. Les nuits paires, ton téléphone te propose en plus de dévorer un loup (ou personne).",
  tips: ["Laisse la meute faire le ménage chez les villageois avant de t'en prendre à elle.", "Ne te fais pas remarquer : pour les loups, tu es l'un des leurs."]
};
ROLES.infect = {
  name: "Infect Père des Loups", icon: "🧛", camp: "wolf", expansion: true,
  short: "Une fois par partie, il transforme la victime des loups en loup.",
  goal: "Éliminer jusqu'au dernier villageois.",
  power: "Personnage d'extension. C'est un Loup-Garou. Une seule fois dans la partie, au lieu de dévorer la victime de la meute, il peut l'infecter : la victime survit, devient secrètement un loup (en gardant son pouvoir) et se réveille désormais avec la meute.",
  app: "Pendant le tour des loups, un interrupteur « Infecter la victime » apparaît sous les votes. Si la meute s'accorde, la victime rejoint les loups au lieu de mourir.",
  tips: ["Infecter la Voyante ou la Sorcière, c'est retourner leur pouvoir contre le village.", "Une nuit sans mort, c'est suspect : le village va se méfier."]
};
ROLES.raven = {
  name: "Corbeau", icon: "🐦‍⬛", camp: "village", expansion: true,
  short: "Chaque nuit, il charge un joueur de 2 voix pour le vote du lendemain.",
  goal: "Aider le village à éliminer le dernier Loup-Garou.",
  power: "Personnage d'extension. Chaque nuit, le Corbeau peut désigner un joueur. Au matin, le village l'apprend : ce joueur commence le vote du jour avec 2 voix contre lui.",
  app: "La nuit, touche un joueur (ou personne). L'appli annonce sa désignation au matin et ajoute les 2 voix au vote.",
  tips: ["Utilise-le pour appuyer tes soupçons sans te dévoiler.", "Les loups vont chercher le Corbeau : fais-le avec discrétion."]
};
ROLES.scapegoat = {
  name: "Bouc émissaire", icon: "🐐", camp: "village", expansion: true,
  short: "En cas d'égalité au vote, c'est lui qui est éliminé.",
  goal: "Aider le village à éliminer le dernier Loup-Garou.",
  power: "Personnage d'extension. Si le vote du village se termine par une égalité, ce n'est pas un des ex-æquo qui meurt : c'est le Bouc émissaire, à leur place.",
  app: "Rien à faire : en cas d'égalité, le meneur (ou le modo) l'élimine à la place des ex-æquo.",
  tips: ["Pousse le village à toujours trouver une majorité.", "Ta mort sur une égalité ne prouve rien contre les autres."]
};
ROLES.wildchild = {
  name: "Enfant sauvage", icon: "🧒", camp: "village", expansion: true,
  short: "Il choisit un modèle : si ce modèle meurt, il devient loup.",
  goal: "Aider le village… tant que son modèle est en vie.",
  power: "Personnage d'extension. La première nuit, l'Enfant sauvage choisit un joueur comme modèle. Tant que ce modèle est en vie, il est villageois. Si le modèle meurt, l'Enfant sauvage devient un Loup-Garou et rejoint la meute.",
  app: "La première nuit, touche ton modèle. S'il meurt, ton téléphone te prévient et tu te réveilles désormais avec les loups.",
  tips: ["Choisis quelqu'un de sûr… ou quelqu'un que tu voudrais voir disparaître ?", "Protège ton modèle, sinon tu changes de camp."]
};
ROLES.fox = {
  name: "Renard", icon: "🦊", camp: "village", expansion: true,
  short: "Il flaire un joueur et ses deux voisins : y a-t-il un loup ?",
  goal: "Aider le village à éliminer le dernier Loup-Garou.",
  power: "Personnage d'extension. Chaque nuit, le Renard désigne un joueur : il apprend si au moins un loup se cache parmi ce joueur et ses deux voisins de table. S'il n'y a aucun loup, il perd son flair pour le reste de la partie.",
  app: "La nuit, touche un joueur : la réponse s'affiche aussitôt, avec les deux voisins concernés (dans l'ordre de la table de l'appli).",
  tips: ["Vise une zone où tu soupçonnes plusieurs joueurs.", "Un « aucun loup » innocente trois joueurs d'un coup."]
};
export const BASE = ["seer", "witch", "hunter", "cupid", "girl", "thief"];
export const EXPANSIONS = ["guard", "elder", "idiot", "angel", "whitewolf", "infect", "raven", "scapegoat", "wildchild", "fox"];
// Cards that wake with the pack.
export const WOLF_ROLES = ["wolf", "whitewolf", "infect"];
export const SPECIALS = [...BASE, ...EXPANSIONS];
export const ROLE_ORDER = ["wolf", "villager", ...SPECIALS];

// Cartes qui ne sont pas des rôles, mais qu'on peut recevoir en cours de partie.
// (L'identifiant « mayor » est gardé pour le Capitaine.)
export const EXTRA = {
  mayor: {
    name: "Capitaine", icon: "🎖️", camp: "",
    short: "Élu par le village, sa voix compte double.",
    goal: "Le Capitaine garde sa carte et son camp : c'est une charge en plus.",
    power: "Le Capitaine est élu par le village, à la majorité relative (on peut se présenter, ou proposer quelqu'un). Sa voix compte double lors des votes, et en cas d'égalité, c'est son vote qui désigne la victime. S'il est éliminé, il désigne son successeur dans son dernier souffle.",
    app: "L'élection a lieu au premier matin, comme un vote normal. Le Capitaine porte la médaille 🎖️ à côté de son nom. En cas d'égalité, l'appli élimine celui pour qui il a voté ; s'il n'a voté pour aucun des ex-æquo, on revote entre eux.",
    tips: ["Un loup Capitaine, c'est une catastrophe pour le village : choisissez bien.", "Le successeur désigné en dit long sur le camp du Capitaine mort…"]
  },
  lovers: {
    name: "Les Amoureux", icon: "💞", camp: "",
    short: "Si l'un meurt, l'autre meurt de chagrin.",
    goal: "S'ils sont dans le même camp, ils jouent pour ce camp. Si l'un est loup et l'autre villageois, ils doivent éliminer tous les autres joueurs pour gagner ensemble.",
    power: "Désignés par Cupidon la première nuit, ils se reconnaissent sans se montrer leur carte. Si l'un meurt, l'autre meurt immédiatement de chagrin. Un Amoureux ne doit jamais voter contre son aimé, ni lui porter aucun préjudice.",
    app: "Si tu es amoureux, le nom de ton âme sœur s'affiche sous ta carte avec un 💞. L'appli t'empêche de voter contre lui, de le dévorer, de l'empoisonner ou de lui tirer dessus.",
    tips: ["Protéger son amoureux, c'est se protéger soi-même.", "Un couple loup + villageois doit cacher son jeu à tout le monde."]
  }
};

export const CAMPS = { village: "Camp du village", wolf: "Camp des loups", solo: "Joue seul" };
