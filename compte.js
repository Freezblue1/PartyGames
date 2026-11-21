// Compte « Ce soir on joue » : connexion et inscription depuis l'accueil.
// Le serveur (netlify/functions/compte.mjs) vérifie le pseudo et le mot de passe, puis renvoie un jeton Firebase.
// La session Firebase est partagée par tous les jeux du site : connecté ici, tu l'es partout.
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const $ = id => document.getElementById(id);
const dlg = $("acctDlg"), form = $("acctForm"), btn = $("acct"), err = $("acctErr"), go = $("acctGo");
let auth = null, A = null, mode = "connexion", busy = false;

// Identifies this phone for the "one account per phone" rule. Shared by every page of the site (same origin).
function deviceId() {
  try {
    let id = localStorage.getItem("soiree-appareil");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("soiree-appareil", id); }
    return id;
  } catch { return ""; }
}

const pseudoOf = async user => user && !user.isAnonymous ? String((await user.getIdTokenResult()).claims.pseudo || "") : "";

async function loadAuth() {
  const [appMod, authMod] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js")]);
  A = authMod;
  auth = A.getAuth(appMod.initializeApp(firebaseConfig));
  await auth.authStateReady();
  A.onAuthStateChanged(auth, render);
}

async function render() {
  const pseudo = await pseudoOf(auth?.currentUser);
  btn.textContent = pseudo ? "👤 " + pseudo : "Se connecter";
  btn.classList.toggle("on", !!pseudo);
  $("acctName").textContent = pseudo;
  form.hidden = !!pseudo;
  $("acctIn").hidden = !pseudo;
}

function setMode(m) {
  mode = m;
  form.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  const signup = m === "inscription";
  go.textContent = signup ? "Créer mon compte" : "Se connecter";
  $("pass").autocomplete = signup ? "new-password" : "current-password";
  $("modeHint").textContent = signup
    ? "3 à 18 caractères pour le pseudo, 6 au moins pour le mot de passe. Un seul compte par téléphone."
    : "Ton pseudo sera proposé tout seul dans tous les jeux, sur tous tes appareils.";
  showErr("");
}

function showErr(msg) { err.textContent = msg; err.hidden = !msg; }

async function submit(e) {
  e.preventDefault();
  if (busy) return;
  const pseudo = $("pseudo").value.trim(), password = $("pass").value;
  if (!pseudo || !password) { showErr("Entre ton pseudo et ton mot de passe."); return; }
  busy = true; go.disabled = true; showErr("");
  const label = go.textContent; go.textContent = "Un instant…";
  try {
    if (!auth) await loadAuth();
    const res = await fetch("/api/compte/" + mode, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo, password, device: deviceId() }) });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(res.status === 404 || res.status === 501 ? "Les comptes ne marchent que sur le site en ligne." : "Le serveur ne répond pas. Réessaie dans un moment.");
    if (!res.ok) throw new Error(data.error || "Ça n'a pas marché. Réessaie.");
    await A.signInWithCustomToken(auth, data.token);
    form.reset();
    await render();
  } catch (e2) {
    showErr(e2?.code ? "Connexion à Firebase impossible (" + e2.code + ")." : e2?.message || "Pas de réseau ?");
  } finally {
    busy = false; go.disabled = false; go.textContent = label;
  }
}

btn.addEventListener("click", () => { showErr(""); dlg.showModal(); if (!form.hidden) $("pseudo").focus(); });
dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
form.addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); });
form.addEventListener("submit", submit);
$("showPass").addEventListener("click", e => {
  const show = $("pass").type === "password";
  $("pass").type = show ? "text" : "password";
  e.currentTarget.setAttribute("aria-pressed", String(show));
  e.currentTarget.textContent = show ? "Cacher" : "Afficher";
});
$("logout").addEventListener("click", async () => { await A.signOut(auth); setMode("connexion"); });

loadAuth().then(render).catch(() => { btn.textContent = "Se connecter"; });
