// Starts the Firebase emulators, runs a command against them, then stops them.
// Uses the portable Java in tests/.jdk when there is one (otherwise the Java on the PATH).
//   node with-emulators.mjs firestore,auth "playwright test -c e2e/playwright.config.mjs"
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const [only, command] = process.argv.slice(2);
if (!only || !command) { console.error('usage: node with-emulators.mjs <emulators> "<command>"'); process.exit(2); }

// The CLI only loads rules from inside this folder: copy the site's real rules file in (git-ignored).
copyFileSync(join(here, "..", "firestore.rules"), join(here, "firestore.rules"));

const env = { ...process.env };
const jdkRoot = join(here, ".jdk");
const jdk = existsSync(jdkRoot) && readdirSync(jdkRoot).map(d => join(jdkRoot, d)).find(d => existsSync(join(d, "bin")));
if (jdk) { env.JAVA_HOME = jdk; env.PATH = join(jdk, "bin") + delimiter + (env.PATH || env.Path || ""); delete env.Path; }

// One quoted command line: the folder name has a space ("Party Games") and Windows needs a shell to run .cmd files.
const firebase = join(here, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
const line = `"${firebase}" emulators:exec --only ${only} --project qui-de-nous-7244f "${command.replace(/"/g, '\\"')}"`;
const child = spawn(line, { cwd: here, env, stdio: "inherit", shell: true });
child.on("exit", code => process.exit(code ?? 1));
