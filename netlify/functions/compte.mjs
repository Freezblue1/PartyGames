// POST /api/compte/inscription  { pseudo, password }  → { pseudo, token }
// POST /api/compte/connexion    { pseudo, password }  → { pseudo, admin, token }
// POST /api/compte/moi          { idToken, password, action: password | delete, newPassword? }  (son propre compte)
// POST /api/compte/erreur       { message, game, screen, stack, page, browser, pseudo }  (une page a planté)
// POST /api/compte/admin        { idToken, action: list | reset | delete | ban | unban | usage, pseudo?, password? }
// Le token se donne à Firebase (signInWithCustomToken). Toute la logique est dans ../lib/comptes.mjs.
import { handle } from "../lib/comptes.mjs";

export default (req, context) => handle(req, context);

export const config = { path: ["/api/compte/inscription", "/api/compte/connexion", "/api/compte/moi", "/api/compte/admin", "/api/compte/erreur"] };
