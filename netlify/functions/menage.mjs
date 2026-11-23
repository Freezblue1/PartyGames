// Tous les jours : ferme les groupes où personne n'est passé depuis 3 jours (fonction planifiée Netlify).
import { closeIdleGroups } from "../lib/comptes.mjs";

export default async () => {
  const { closed } = await closeIdleGroups({ env: process.env, fetch: globalThis.fetch });
  console.log("groupes fermés :", closed.length ? closed.join(", ") : "aucun");
};

export const config = { schedule: "@daily" };
