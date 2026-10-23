#!/usr/bin/env node
// Interactive setup: creates/updates .env with the admin login and a random AUTH_SECRET.
// Usage: npm run setup
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");

// One shared interface, so piped input (non-interactive use) works too.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput?.bind(rl);
if (write) {
  // show "*" instead of the typed characters while reading a password
  rl._writeToOutput = (s) => write(muted && !s.includes("\n") ? "*".repeat(s.length) : s);
}

// The async iterator buffers lines, so piped answers are not lost between questions.
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value = "" } = await lines.next();
  muted = false;
  if (hidden && process.stdin.isTTY) process.stdout.write("\n");
  return value.trim();
}

function setVar(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : content.replace(/\n?$/, "\n") + line + "\n";
}

const username = (await ask("Admin username [admin]: ")) || "admin";
if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
  console.error("Username must be 3-32 chars: letters, numbers, _ . -");
  process.exit(1);
}
const password = await ask("Admin password (min 10 chars): ", { hidden: true });
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
const confirm = await ask("Repeat password: ", { hidden: true });
if (password !== confirm) {
  console.error("Passwords do not match.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const passwordHash = `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;

let env = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : existsSync(".env.example")
    ? readFileSync(".env.example", "utf8")
    : "";

if (!/^AUTH_SECRET=.{32,}$/m.test(env)) env = setVar(env, "AUTH_SECRET", randomBytes(48).toString("base64url"));
env = setVar(env, "ADMIN_USERNAME", username);
env = setVar(env, "ADMIN_PASSWORD_HASH", passwordHash);

rl.close();
writeFileSync(envPath, env);
chmodSync(envPath, 0o600);
console.log(`\n✔ Saved to ${envPath} (permissions 600).`);
console.log("  Restart to apply: sudo systemctl restart clau-ai  (PM2 installs: pm2 restart clau-ai; dev: npm run dev)");
