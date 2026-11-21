/* Les persos à deviner, par thème. Une ligne = un perso.
   Ce qui suit les barres « | » sont d'autres façons de le dire : elles servent à reconnaître une bonne réponse
   (« Zizou » vaut « Zinédine Zidane »). Les articles et les accents ne comptent pas. À modifier librement. */
export const THEMES = [
  {
    id: "stars", name: "Stars francophones", cards: [
      "Omar Sy", "Jean Dujardin|Dujardin", "Marion Cotillard|Cotillard", "Louis de Funès|De Funès|Funès",
      "Jean-Paul Belmondo|Belmondo|Bébel", "Alain Delon|Delon", "Brigitte Bardot|Bardot|BB", "Catherine Deneuve|Deneuve",
      "Sophie Marceau|Marceau", "Audrey Tautou|Tautou", "Jean Reno", "Christian Clavier|Clavier", "Dany Boon",
      "Kad Merad", "Franck Dubosc|Dubosc", "Fabrice Luchini|Luchini", "Pierre Niney|Niney", "Léa Seydoux|Seydoux",
      "Vincent Cassel|Cassel", "Jamel Debbouze|Jamel|Debbouze", "Gad Elmaleh|Gad|Elmaleh", "Florence Foresti|Foresti",
      "Kev Adams", "Élie Semoun|Semoun", "Mister V", "Johnny Hallyday|Johnny|Hallyday", "Édith Piaf|Piaf",
      "Serge Gainsbourg|Gainsbourg", "Charles Aznavour|Aznavour", "Jacques Brel|Brel", "Mylène Farmer",
      "Céline Dion", "Stromae", "Aya Nakamura", "Angèle", "Jul", "Booba", "Orelsan", "Gims|Maître Gims", "Soprano",
      "Nekfeu", "Vianney", "Zaz", "Jean-Jacques Goldman|Goldman", "Michel Sardou|Sardou", "Renaud",
      "Francis Cabrel|Cabrel", "Patrick Bruel|Bruel", "Vanessa Paradis", "Clara Luciani|Luciani", "Louane",
      "Cyril Hanouna|Hanouna|Baba", "Nagui", "Michel Drucker|Drucker", "Stéphane Bern", "Philippe Etchebest|Etchebest",
      "Cyril Lignac|Lignac", "Squeezie", "Norman", "Cyprien", "Inoxtag", "Léna Situations|Léna Mahfouf",
      "Thomas Pesquet|Pesquet", "Nabilla", "Karine Le Marchand", "Mimie Mathy|Joséphine ange gardien"
    ]
  },
  {
    id: "monde", name: "Stars du monde", cards: [
      "Beyoncé", "Rihanna", "Taylor Swift", "Michael Jackson|MJ", "Madonna", "Elvis Presley|Elvis", "Lady Gaga",
      "Shakira", "Ed Sheeran", "Justin Bieber|Bieber", "Britney Spears|Britney", "Freddie Mercury",
      "John Lennon|Lennon", "Bob Marley|Marley", "Eminem", "Snoop Dogg", "Drake", "Billie Eilish", "Ariana Grande",
      "Adele", "Elton John", "David Bowie|Bowie", "Kim Kardashian", "Leonardo DiCaprio|DiCaprio|Leo",
      "Brad Pitt", "Angelina Jolie", "Johnny Depp", "Tom Cruise", "Will Smith", "Dwayne Johnson|The Rock",
      "Arnold Schwarzenegger|Schwarzenegger|Schwarzy", "Jackie Chan", "Keanu Reeves", "Marilyn Monroe|Marilyn",
      "Charlie Chaplin|Chaplin|Charlot", "Meryl Streep", "Scarlett Johansson", "Zendaya", "Margot Robbie",
      "Ryan Gosling", "Morgan Freeman", "Jim Carrey", "Rowan Atkinson|Mr Bean", "Elon Musk|Musk",
      "Mark Zuckerberg|Zuckerberg", "Bill Gates", "Steve Jobs", "Oprah Winfrey|Oprah", "Barack Obama|Obama",
      "Donald Trump|Trump", "Gordon Ramsay", "Bad Bunny", "Dua Lipa", "The Weeknd", "Jennifer Lopez|JLo|J.Lo",
      "Mariah Carey", "Tom Holland", "Le dalaï-lama|Dalaï-lama"
    ]
  },
  {
    id: "fiction", name: "Films & séries", cards: [
      "Harry Potter", "Hermione Granger|Hermione", "Voldemort|Lord Voldemort|Tom Jedusor", "Albus Dumbledore|Dumbledore",
      "Dark Vador|Darth Vader|Vador", "Luke Skywalker", "Maître Yoda|Yoda", "Chewbacca|Chewie", "James Bond|007",
      "Indiana Jones|Indy", "Jack Sparrow", "Gandalf", "Frodon|Frodo", "Gollum|Sméagol", "Sherlock Holmes",
      "Le Joker|Joker", "Batman|Bruce Wayne", "Superman|Clark Kent", "Spider-Man|Spiderman|Peter Parker",
      "Iron Man|Tony Stark", "Wonder Woman", "Hulk", "Thor", "Captain America", "Wolverine", "Deadpool",
      "Terminator", "Rocky Balboa|Rocky", "Forrest Gump", "Hannibal Lecter", "Dracula",
      "Frankenstein|Le monstre de Frankenstein", "King Kong", "Godzilla", "E.T.|ET|L'extraterrestre", "Rambo",
      "Jon Snow", "Daenerys Targaryen|Daenerys|Khaleesi", "Walter White|Heisenberg", "Onze (Stranger Things)|Onze|Eleven",
      "Mercredi Addams|Mercredi|Wednesday", "Arsène Lupin|Lupin", "OSS 117|Hubert Bonisseur de La Bath",
      "Le Professeur (La Casa de Papel)|Le Professeur", "Tony Montana|Scarface", "Le Parrain|Vito Corleone|Don Corleone",
      "Neo (Matrix)|Neo", "Barbie", "Mary Poppins", "Willy Wonka", "Edward aux mains d'argent|Edward",
      "Bridget Jones", "Amélie Poulain|Amélie", "Perceval (Kaamelott)|Perceval", "Brice de Nice|Brice",
      "Jacquouille la Fripouille|Jacquouille", "Hercule Poirot|Poirot", "Freddy Krueger|Freddy", "Chucky",
      "Grippe-Sou (Ça)|Grippe-Sou|Pennywise", "Dr House|House", "Sheldon Cooper|Sheldon", "Jack Dawson (Titanic)|Jack Dawson"
    ]
  },
  {
    id: "anime", name: "Dessins animés, BD & jeux vidéo", cards: [
      "Mickey", "Minnie", "Donald Duck|Donald", "Dingo", "Picsou|Oncle Picsou", "Bugs Bunny", "Titi", "Grosminet",
      "Tom (Tom et Jerry)|Tom", "Jerry (Tom et Jerry)|Jerry", "Scooby-Doo|Scooby", "Homer Simpson|Homer",
      "Bart Simpson|Bart", "Bob l'éponge", "Patrick l'étoile de mer|Patrick", "Shrek", "L'Âne (Shrek)|L'Âne",
      "Pikachu", "Sacha (Pokémon)|Sacha|Ash", "Son Goku|Goku|Sangoku", "Naruto", "Monkey D. Luffy|Luffy", "Totoro",
      "Mario", "Luigi", "Princesse Peach|Peach", "Bowser", "Sonic", "Link (Zelda)|Link", "Pac-Man|Pacman",
      "Lara Croft", "Kirby", "Donkey Kong", "Un Creeper (Minecraft)|Creeper", "Astérix", "Obélix", "Idéfix", "Tintin",
      "Milou", "Capitaine Haddock|Haddock", "Lucky Luke", "Gaston Lagaffe|Gaston", "La Schtroumpfette|Schtroumpfette",
      "Le Grand Schtroumpf|Grand Schtroumpf", "Garfield", "Snoopy", "Winnie l'ourson|Winnie", "Peter Pan",
      "Blanche-Neige", "Cendrillon", "Ariel (La Petite Sirène)|Ariel|La Petite Sirène", "Simba", "Stitch",
      "Elsa (La Reine des neiges)|Elsa|La Reine des neiges", "Olaf", "Buzz l'Éclair|Buzz", "Woody", "Nemo", "Dory",
      "Le Génie (Aladdin)|Génie", "Pinocchio", "Bambi", "Peppa Pig|Peppa", "Dora l'exploratrice|Dora", "Oui-Oui",
      "Barbapapa", "Caliméro", "T'choupi|Tchoupi", "Inspecteur Gadget|Gadget", "Ladybug (Miraculous)|Ladybug",
      "Cartman (South Park)|Cartman", "Rémy (Ratatouille)|Rémy|Ratatouille", "Un Minion|Minion|Les Minions"
    ]
  },
  {
    id: "histoire", name: "Personnages historiques", cards: [
      "Napoléon|Bonaparte|Napoléon Bonaparte", "Jules César|César", "Cléopâtre", "Jeanne d'Arc",
      "Louis XIV|Louis 14|Le Roi-Soleil", "Marie-Antoinette", "Charlemagne", "Vercingétorix", "Albert Einstein|Einstein",
      "Marie Curie", "Isaac Newton|Newton", "Léonard de Vinci|De Vinci|Vinci", "Mozart|Wolfgang Amadeus Mozart",
      "Beethoven", "Pablo Picasso|Picasso", "Vincent van Gogh|Van Gogh", "Christophe Colomb|Colomb",
      "Neil Armstrong|Armstrong", "Gandhi|Mahatma Gandhi", "Martin Luther King", "Nelson Mandela|Mandela",
      "Abraham Lincoln|Lincoln", "Charles de Gaulle|De Gaulle|Le général de Gaulle", "Winston Churchill|Churchill",
      "Elizabeth II|Élisabeth II|La reine d'Angleterre", "Lady Diana|Diana|Lady Di", "John F. Kennedy|Kennedy|JFK",
      "Che Guevara|Le Che", "Victor Hugo|Hugo", "Molière", "William Shakespeare|Shakespeare",
      "Jean de La Fontaine|La Fontaine", "Louis Pasteur|Pasteur", "Gustave Eiffel|Eiffel", "Coco Chanel|Chanel",
      "Simone Veil", "Joséphine Baker", "Toutânkhamon|Toutankhamon", "Alexandre le Grand", "Gengis Khan", "Attila",
      "Robin des Bois", "Le roi Arthur", "Galilée", "Charles Darwin|Darwin", "Sigmund Freud|Freud", "Karl Marx|Marx",
      "Socrate", "Ramsès II|Ramsès", "Marco Polo", "Le commandant Cousteau|Jacques Cousteau|Cousteau",
      "Thomas Edison|Edison", "Nikola Tesla|Tesla", "Frida Kahlo", "Rosa Parks", "Jacques Chirac|Chirac",
      "François Mitterrand|Mitterrand", "Emmanuel Macron|Macron", "Louis XVI|Louis 16", "Henri IV|Henri 4",
      "Spartacus", "Le pape François|Pape François"
    ]
  },
  {
    id: "sport", name: "Sportifs", cards: [
      "Zinédine Zidane|Zidane|Zizou", "Kylian Mbappé|Mbappé", "Antoine Griezmann|Griezmann|Grizou",
      "Karim Benzema|Benzema", "Thierry Henry", "Paul Pogba|Pogba", "Didier Deschamps|Deschamps", "Lionel Messi|Messi",
      "Cristiano Ronaldo|CR7", "Neymar", "Pelé", "Diego Maradona|Maradona", "David Beckham|Beckham",
      "Zlatan Ibrahimović|Zlatan|Ibrahimovic", "Erling Haaland|Haaland", "Usain Bolt|Bolt", "Michael Jordan",
      "LeBron James|LeBron", "Victor Wembanyama|Wembanyama|Wemby", "Tony Parker", "Kobe Bryant|Kobe",
      "Stephen Curry|Curry", "Teddy Riner|Riner", "Léon Marchand", "Antoine Dupont", "Serena Williams|Serena",
      "Roger Federer|Federer", "Rafael Nadal|Nadal|Rafa", "Novak Djokovic|Djokovic", "Yannick Noah|Noah",
      "Mohamed Ali|Muhammad Ali|Cassius Clay", "Mike Tyson|Tyson", "Tiger Woods", "Michael Phelps|Phelps",
      "Florent Manaudou", "Laure Manaudou", "Marie-José Pérec|Pérec", "Sébastien Loeb|Loeb",
      "Michael Schumacher|Schumacher", "Lewis Hamilton|Hamilton", "Ayrton Senna|Senna", "Alain Prost|Prost",
      "Martin Fourcade|Fourcade", "Renaud Lavillenie|Lavillenie", "Simone Biles|Biles", "Nadia Comaneci|Comaneci",
      "Tadej Pogačar|Pogacar", "Bernard Hinault|Hinault", "Tony Estanguet|Estanguet", "Sébastien Chabal|Chabal",
      "Jonah Lomu|Lomu", "Shaquille O'Neal|Shaq", "Mohamed Salah|Salah", "Ronaldinho", "Franck Ribéry|Ribéry",
      "Fabien Barthez|Barthez", "Lilian Thuram", "Éric Cantona|Cantona"
    ]
  },
  {
    id: "animaux", name: "Animaux", cards: [
      "Un lion", "Un éléphant", "Une girafe", "Un manchot|Un pingouin", "Un kangourou", "Un koala", "Un panda",
      "Un dauphin", "Un requin", "Une baleine", "Une pieuvre|Un poulpe", "Une méduse", "Un crocodile", "Un serpent",
      "Un caméléon", "Une tortue", "Un escargot", "Une fourmi", "Une abeille", "Un moustique", "Un papillon",
      "Une araignée", "Une chauve-souris", "Un hibou|Une chouette", "Un perroquet", "Un flamant rose", "Une autruche",
      "Un paon", "Une poule", "Un coq", "Une vache", "Un cochon", "Un mouton", "Une chèvre", "Un cheval", "Un âne",
      "Un lapin", "Un hamster", "Un chat", "Un chien", "Une souris", "Un rat", "Un écureuil", "Un hérisson",
      "Un castor", "Un loup", "Un renard", "Un ours polaire", "Un gorille", "Un paresseux", "Un zèbre",
      "Un hippopotame", "Un rhinocéros", "Un chameau|Un dromadaire", "Un lama", "Un morse", "Un phoque", "Un homard",
      "Une crevette", "Un T-Rex|Un tyrannosaure|Un dinosaure", "Une licorne", "Un ornithorynque", "Une grenouille",
      "Un pigeon", "Un poisson rouge"
    ]
  },
  {
    id: "bouffe", name: "À table !", cards: [
      "Une raclette", "Une fondue savoyarde|Une fondue", "Une baguette", "Un croissant",
      "Un pain au chocolat|Une chocolatine", "Un camembert", "Une pizza", "Un kebab", "Un burger|Un hamburger",
      "Des sushis|Un sushi", "Une crêpe", "Des huîtres|Une huître", "Des escargots de Bourgogne", "Un macaron",
      "De la mayonnaise|Mayo", "Du ketchup", "Un French tacos|Un tacos", "Des frites", "Une tartiflette",
      "Un cassoulet", "Un couscous", "Une paella", "Un hot-dog", "Un croque-monsieur", "Une quiche lorraine|Une quiche",
      "Un steak tartare|Un tartare", "Du foie gras", "Une bûche de Noël", "Une galette des rois",
      "Un éclair au chocolat|Un éclair", "Un mille-feuille", "Une glace|Une crème glacée", "Une barbe à papa",
      "Du Nutella", "Un avocat (le fruit)|Un avocat", "Une banane", "Un ananas", "Une pastèque", "Un piment",
      "Un oignon", "Une carotte", "Un brocoli", "Un œuf|Un oeuf", "Une fraise Tagada", "Du champagne", "Une bière",
      "Un pastis|Un Ricard", "Un mojito", "Un café|Un expresso", "Du pop-corn", "Un yaourt",
      "Des spaghettis bolognaise|Des spaghettis|Des pâtes", "Une soupe à l'oignon", "Un bretzel", "Un donut",
      "Des chips", "Un cornichon", "Des sardines en boîte|Des sardines", "Une pomme d'amour", "Un Kinder Surprise|Kinder"
    ]
  },
  {
    id: "objets", name: "Objets", cards: [
      "Une brosse à dents", "Un grille-pain", "Une machine à laver", "Un frigo|Un réfrigérateur", "Un parapluie",
      "Une chaussette", "Une tong", "Un smartphone|Un téléphone portable|Un téléphone", "Une télécommande",
      "Un aspirateur", "Une poêle", "Une fourchette", "Un tire-bouchon", "Un rouleau de papier toilette|Du papier toilette|PQ",
      "Une brosse à toilettes|Une balayette", "Un sèche-cheveux", "Un fer à repasser", "Un réveil", "Une lampe de poche",
      "Une bougie", "Un ballon de foot|Un ballon", "Un vélo", "Une trottinette", "Une voiture", "Un avion",
      "Une montgolfière", "Un sous-marin", "Une fusée", "Une guitare", "Un piano", "Une batterie", "Un micro",
      "Une boule à facettes", "Un appareil photo", "Une télé|Une télévision", "Une console de jeux|Une console",
      "Un ordinateur", "Une clé USB", "Une imprimante", "Une calculatrice", "Un stylo", "Une gomme", "Un cartable",
      "Un sac à main", "Une valise", "Des lunettes de soleil", "Une perruque", "Une cravate", "Un slip",
      "Un soutien-gorge", "Une couche|Une couche-culotte", "Un doudou", "Une tétine", "Un nain de jardin",
      "Une tondeuse", "Une brouette", "Une échelle", "Un marteau", "Une perceuse", "Une tronçonneuse", "Une boussole",
      "Une tente", "Un matelas gonflable", "Un sapin de Noël", "Un cercueil", "Une bouée canard|Une bouée",
      "Une perche à selfie", "Un trampoline"
    ]
  },
  {
    id: "metiers", name: "Métiers & persos types", cards: [
      "Un pompier", "Un policier|Un flic", "Un médecin|Un docteur", "Un dentiste", "Un chirurgien",
      "Un infirmier|Une infirmière", "Un boulanger", "Un boucher", "Un plombier", "Un électricien", "Un facteur",
      "Un astronaute|Un cosmonaute", "Un pilote d'avion|Un pilote de ligne", "Un steward|Une hôtesse de l'air",
      "Un prof|Un professeur|Un instituteur", "Un maître-nageur", "Un chauffeur de taxi", "Un serveur",
      "Un chef cuisinier|Un cuisinier", "Un vétérinaire", "Un avocat (le métier)|Un avocat", "Un juge",
      "Un agent secret|Un espion", "Un magicien", "Un clown", "Un dompteur de lions|Un dompteur", "Un mime",
      "Un influenceur|Une influenceuse", "Un youtubeur", "Un DJ", "Une cantatrice|Un chanteur d'opéra", "Un coiffeur",
      "Un tatoueur", "Un fleuriste", "Un agriculteur|Un paysan", "Un pêcheur", "Un bûcheron", "Un jardinier",
      "Un architecte", "Un archéologue", "Un détective privé|Un détective", "Un pirate", "Un chevalier", "Un cowboy",
      "Un ninja", "Un samouraï", "Une sorcière", "Un vampire", "Un zombie", "Un fantôme", "Un extraterrestre|Un alien",
      "Le Père Noël|Père Noël", "La petite souris", "Un lutin", "Un roi", "Une princesse", "Un moine", "Un gendarme",
      "Un soldat|Un militaire", "Un sumo|Un sumotori", "Un catcheur", "Un arbitre", "Un mannequin", "Un photographe",
      "Un caissier|Une caissière", "Un éboueur", "Un garagiste|Un mécanicien", "Un croque-mort",
      "Le président de la République|Le président", "Un hacker"
    ]
  },
  {
    id: "minuit", name: "Après minuit (18+)", cards: [
      "Un préservatif|Une capote", "Un vibromasseur|Un vibro|Un sextoy", "Un string", "Des menottes", "Un plan cul",
      "Une gueule de bois", "Un strip-teaseur|Une strip-teaseuse", "Un sex-shop", "Un suçon", "Un test de grossesse",
      "Un fouet", "Un lit qui grince", "Un ex toxique|Un ex", "Un date Tinder|Tinder", "Le walk of shame",
      "Un shot de tequila|Une tequila", "Un videur de boîte|Un videur", "Une poupée gonflable", "Le Kamasutra",
      "Un nude", "Un SMS envoyé à la mauvaise personne", "Un pet", "Un slip sale", "Un gigolo", "Un plan à trois",
      "Une MST|Une chlamydia", "Un enterrement de vie de garçon|Un EVG", "Un enterrement de vie de jeune fille|Un EVJF",
      "Un after", "Un coup d'un soir", "Un cocu", "Une danse sur le comptoir", "Un body shot", "Un roulage de pelle|Une pelle",
      "Une paire de fesses|Des fesses", "Un tue-l'amour", "Une capote trouée", "Une épilation du maillot",
      "Un massage qui dérape", "Une soirée mousse", "Un karaoké bourré", "Un texto de 3 h du matin"
    ]
  }
];
