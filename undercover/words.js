/* Paires de mots proches. À chaque partie, une paire est tirée au hasard
   et l'ordre est mélangé : n'importe lequel des deux peut être le mot des civils. */
export const PACKS = [
  {
    id: 1, name: "Classique", desc: "Pour tout le monde",
    pairs: [
      ["Chat", "Chien"], ["Café", "Thé"], ["Plage", "Piscine"], ["Pizza", "Burger"], ["Avion", "Hélicoptère"],
      ["Train", "Métro"], ["Vélo", "Trottinette"], ["Lune", "Soleil"], ["Pomme", "Poire"], ["Citron", "Orange"],
      ["Fourchette", "Cuillère"], ["Lac", "Étang"], ["Guitare", "Violon"], ["Piano", "Orgue"], ["Football", "Rugby"],
      ["Tennis", "Badminton"], ["Ski", "Snowboard"], ["Noël", "Nouvel An"], ["Neige", "Grêle"], ["Pluie", "Orage"],
      ["Médecin", "Infirmier"], ["Pompier", "Policier"], ["Boulanger", "Pâtissier"], ["Croissant", "Pain au chocolat"],
      ["Crêpe", "Gaufre"], ["Raclette", "Fondue"], ["Sushi", "Ramen"], ["Ketchup", "Mayonnaise"], ["Chocolat", "Caramel"],
      ["Glace", "Sorbet"], ["Oreiller", "Coussin"], ["Lit", "Canapé"], ["Douche", "Baignoire"], ["Lunettes", "Lentilles"],
      ["Bague", "Collier"], ["Baskets", "Tongs"], ["Parapluie", "Imperméable"], ["Téléphone", "Tablette"],
      ["Instagram", "TikTok"], ["Netflix", "YouTube"], ["Batman", "Superman"], ["Harry Potter", "Le Seigneur des anneaux"],
      ["Mario", "Sonic"], ["Lion", "Tigre"], ["Requin", "Dauphin"], ["Abeille", "Guêpe"], ["Grenouille", "Crapaud"],
      ["Poule", "Canard"], ["Cheval", "Âne"], ["Tortue", "Escargot"], ["Paris", "Londres"], ["Château", "Palais"],
      ["Camping", "Hôtel"], ["Zoo", "Aquarium"], ["Cinéma", "Théâtre"], ["Cirque", "Fête foraine"], ["Musée", "Bibliothèque"],
      ["Stylo", "Crayon"], ["Livre", "Magazine"], ["Facteur", "Livreur"], ["Bus", "Tramway"], ["Bateau", "Sous-marin"],
      ["Fusée", "Satellite"], ["Dinosaure", "Dragon"], ["Vampire", "Zombie"], ["Sorcière", "Fée"], ["Pirate", "Viking"],
      ["Chevalier", "Samouraï"], ["Ninja", "Espion"], ["Mariage", "Anniversaire"], ["Bougie", "Lampe"], ["Miroir", "Fenêtre"],
      ["Ascenseur", "Escalator"], ["Frigo", "Congélateur"], ["Micro-ondes", "Four"], ["Aspirateur", "Balai"],
      ["Marteau", "Tournevis"], ["Échelle", "Escalier"], ["Clé", "Cadenas"], ["Nutella", "Confiture"], ["Pâtes", "Riz"],
      ["Frites", "Chips"], ["Fraise", "Framboise"], ["Pastèque", "Melon"], ["Sel", "Poivre"], ["Montagne", "Volcan"]
    ]
  },
  {
    id: 2, name: "Soirée", desc: "Apéro, fête et pop culture",
    pairs: [
      ["Bière", "Cidre"], ["Vodka", "Tequila"], ["Vin rouge", "Rosé"], ["Champagne", "Prosecco"], ["Mojito", "Spritz"],
      ["Whisky", "Rhum"], ["Apéro", "Brunch"], ["Boîte de nuit", "Bar"], ["Karaoké", "Blind test"], ["Beer pong", "Action ou vérité"],
      ["Festival", "Concert"], ["DJ", "Rappeur"], ["Barbecue", "Pique-nique"], ["Kebab", "Tacos"], ["McDo", "Burger King"],
      ["Uber", "Taxi"], ["Selfie", "Story"], ["Ibiza", "Mykonos"], ["Las Vegas", "Monaco"], ["Casino", "Loto"],
      ["Poker", "Blackjack"], ["Uno", "Monopoly"], ["Mario Kart", "FIFA"], ["PlayStation", "Xbox"], ["Beyoncé", "Rihanna"],
      ["Koh-Lanta", "Fort Boyard"], ["Star Academy", "The Voice"], ["Friends", "How I Met Your Mother"],
      ["Game of Thrones", "Vikings"], ["Titanic", "Avatar"], ["Disney", "Pixar"], ["Shrek", "L'Âge de glace"],
      ["Tatouage", "Piercing"], ["Barbe", "Moustache"], ["Bronzage", "Coup de soleil"], ["Crème solaire", "Après-soleil"],
      ["Sieste", "Grasse matinée"], ["Gueule de bois", "Indigestion"], ["Glaçon", "Paille"], ["Shot", "Cocktail"],
      ["Afterwork", "Pot de départ"], ["Road trip", "Croisière"]
    ]
  },
  {
    id: 3, name: "Hot", desc: "Adultes seulement",
    pairs: [
      ["Bisou", "Câlin"], ["Coup d'un soir", "Sex friend"], ["Ex", "Crush"], ["Menottes", "Bandeau"], ["Lingerie", "Nuisette"],
      ["String", "Boxer"], ["Préservatif", "Lubrifiant"], ["Massage", "Jacuzzi"], ["Strip-tease", "Lap dance"],
      ["Fantasme", "Rêve érotique"], ["Plan à trois", "Club échangiste"], ["Plage nudiste", "Monokini"], ["Suçon", "Morsure"],
      ["Fessée", "Chatouilles"], ["Sextape", "Nude"], ["Kamasutra", "Cinquante nuances de Grey"], ["Tinder", "Grindr"],
      ["Douche à deux", "Bain moussant"], ["Missionnaire", "Levrette"], ["Huile de massage", "Bougie parfumée"],
      ["Vibromasseur", "Godemichet"], ["Porte-jarretelles", "Bas résille"], ["Cuir", "Latex"], ["Infidélité", "Jalousie"],
      ["Speed dating", "Rendez-vous à l'aveugle"], ["Râteau", "Friendzone"], ["Walk of shame", "Lendemain de soirée"],
      ["Sexto", "Message vocal"], ["Préliminaires", "Câlin du matin"], ["Sex-shop", "Love room"]
    ]
  },
  {
    id: 4, name: "Bouffe", desc: "Plats, desserts et grignotage",
    pairs: [
      ["Tartiflette", "Gratin dauphinois"], ["Croque-monsieur", "Panini"], ["Quiche", "Pizza"], ["Macaron", "Meringue"],
      ["Tiramisu", "Mousse au chocolat"], ["Couscous", "Paella"], ["Lasagnes", "Hachis parmentier"], ["Bœuf bourguignon", "Pot-au-feu"],
      ["Camembert", "Brie"], ["Baguette", "Pain de mie"], ["Éclair", "Religieuse"], ["Pancake", "Crêpe"],
      ["Moules-frites", "Fish and chips"], ["Hot-dog", "Sandwich"], ["Ratatouille", "Soupe"], ["Huîtres", "Moules"],
      ["Foie gras", "Saumon fumé"], ["Bûche de Noël", "Galette des rois"], ["Nems", "Samoussas"], ["Curry", "Chili con carne"],
      ["Fraises Tagada", "Dragibus"], ["Cookie", "Brownie"], ["Popcorn", "Barbe à papa"], ["Mayonnaise", "Aïoli"],
      ["Céréales", "Muesli"], ["Omelette", "Œuf au plat"], ["Steak", "Côtelette"], ["Smoothie", "Milkshake"]
    ]
  },
  {
    id: 5, name: "Voyages", desc: "Valises, pays et vacances",
    pairs: [
      ["Valise", "Sac à dos"], ["Passeport", "Carte d'identité"], ["Aéroport", "Gare"], ["Hôtel", "Airbnb"],
      ["Croisière", "Ferry"], ["New York", "Los Angeles"], ["Rome", "Venise"], ["Espagne", "Portugal"],
      ["Thaïlande", "Bali"], ["Safari", "Zoo"], ["Désert", "Savane"], ["Tour Eiffel", "Big Ben"],
      ["Statue de la Liberté", "Christ Rédempteur"], ["Road trip", "Tour du monde"], ["Camping-car", "Caravane"], ["Jet-lag", "Mal des transports"],
      ["Carte postale", "Souvenir"], ["Guide touristique", "GPS"], ["Auberge de jeunesse", "Couchsurfing"], ["Douane", "Contrôle de sécurité"],
      ["Escale", "Correspondance"], ["Visa", "Billet d'avion"], ["Igloo", "Chalet"], ["Pyramides", "Colisée"],
      ["Japon", "Corée"], ["Luge", "Bobsleigh"]
    ]
  },
  {
    id: 6, name: "Écrans & réseaux", desc: "Applis, téléphones et internet",
    pairs: [
      ["WhatsApp", "Messenger"], ["Snapchat", "BeReal"], ["Facebook", "LinkedIn"], ["Twitter", "Threads"],
      ["Prime Video", "Disney+"], ["Spotify", "Deezer"], ["Emoji", "GIF"], ["Mème", "Vidéo virale"],
      ["Like", "Commentaire"], ["Reel", "Live"], ["Influenceur", "Youtubeur"], ["Google", "Wikipédia"],
      ["ChatGPT", "Siri"], ["Alexa", "Google Home"], ["iPhone", "Samsung"], ["PC", "Mac"],
      ["Clavier", "Souris"], ["Wi-Fi", "Bluetooth"], ["Chargeur", "Batterie externe"], ["Écouteurs", "Casque"],
      ["Mot de passe", "Code PIN"], ["Notification", "Alarme"], ["Message vocal", "Appel vidéo"], ["Uber Eats", "Deliveroo"],
      ["Amazon", "Vinted"], ["Hashtag", "Mention"], ["Bug", "Virus"], ["Zoom", "Teams"]
    ]
  },
  {
    id: 7, name: "Sport", desc: "Terrains, champions et matchs",
    pairs: [
      ["Football", "Handball"], ["Basket", "Volley"], ["Tennis", "Ping-pong"], ["Natation", "Water-polo"],
      ["Boxe", "Judo"], ["Karaté", "Taekwondo"], ["Golf", "Mini-golf"], ["Marathon", "Sprint"],
      ["BMX", "VTT"], ["Surf", "Bodyboard"], ["Escalade", "Randonnée"], ["Yoga", "Pilates"],
      ["Musculation", "CrossFit"], ["Ski nautique", "Jet-ski"], ["Pétanque", "Bowling"], ["Fléchettes", "Billard"],
      ["Équitation", "Rodéo"], ["Patin à glace", "Roller"], ["Coupe du monde", "Jeux olympiques"], ["Arbitre", "Entraîneur"],
      ["Sifflet", "Carton rouge"], ["Mbappé", "Messi"], ["Zidane", "Henry"], ["Formule 1", "Rallye"],
      ["Haltère", "Kettlebell"], ["Plongeon", "Plongée"]
    ]
  },
  {
    id: 8, name: "Ciné & séries", desc: "Films, héros et séries cultes",
    pairs: [
      ["Star Wars", "Star Trek"], ["Marvel", "DC"], ["Iron Man", "Captain America"], ["Spider-Man", "Ant-Man"],
      ["Le Roi Lion", "Le Livre de la jungle"], ["La Reine des neiges", "Raiponce"], ["Toy Story", "Monstres et Cie"], ["Hermione", "Ginny"],
      ["Dumbledore", "Gandalf"], ["Breaking Bad", "Narcos"], ["Stranger Things", "Dark"], ["La Casa de papel", "Lupin"],
      ["Squid Game", "Hunger Games"], ["The Office", "Brooklyn Nine-Nine"], ["Les Simpson", "Family Guy"], ["Pokémon", "Digimon"],
      ["Naruto", "One Piece"], ["James Bond", "Mission impossible"], ["Jurassic Park", "King Kong"], ["Le Parrain", "Scarface"],
      ["Astérix", "Tintin"], ["Les Bronzés", "Les Visiteurs"], ["Bienvenue chez les Ch'tis", "Intouchables"], ["Oscar", "César"],
      ["Dracula", "Frankenstein"], ["Shining", "Ça"], ["Joker", "Harley Quinn"], ["Sherlock Holmes", "Hercule Poirot"],
      ["Gossip Girl", "Riverdale"]
    ]
  }
];
/* « Ce groupe » : les paires inventées par les joueurs de la partie (mots maison). */
export const GROUP_PACK = { id: 0, name: "Ce groupe", desc: "Vos mots maison" };
