// Toutes les nuits (fonction planifiée Netlify) :
//   - ferme les groupes où personne n'est passé depuis 3 jours ;
//   - efface les parties sans aucune action depuis 24 h (avec leurs joueurs, votes, mains, photos…),
//     leurs réactions, et les rapports de plantage de plus de 30 jours.
import { closeIdleGroups, closeOldRooms } from "../lib/comptes.mjs";

export default async () => {
  const deps = { env: process.env, fetch: globalThis.fetch };
  const { closed } = await closeIdleGroups(deps);
  const { deleted, purged } = await closeOldRooms(deps);
  console.log(`groupes fermés : ${closed.length} · parties effacées : ${deleted.length} · réactions et rapports effacés : ${purged}`);
};

export const config = { schedule: "@daily" };
