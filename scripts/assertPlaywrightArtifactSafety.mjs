import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_CREDENTIAL_ENV_NAMES = [
  "E2E_CLERK_USERS",
  "E2E_CLERK_PASSWORD",
  "CLERK_SECRET_KEY",
  "CONVEX_DEPLOY_KEY",
];
const SECRET_ENV_NAME_PATTERN = /(?:PASSWORD|SECRET(?:_KEY)?|TOKEN|PRIVATE_KEY|DEPLOY_KEY|API_KEY)$/i;
const artifactPaths = process.argv.slice(2);
const requiredArtifactPaths = artifactPaths.length > 0 ? artifactPaths : ["test-results.json", "playwright-report"];

const missingCredentialNames = REQUIRED_CREDENTIAL_ENV_NAMES.filter((name) => !process.env[name]);
if (missingCredentialNames.length > 0) {
  console.error(`Playwright artifact safety gate is missing credentials: ${missingCredentialNames.join(", ")}`);
  process.exit(1);
}

const missingArtifactPaths = requiredArtifactPaths.filter((artifactPath) => !existsSync(artifactPath));
if (missingArtifactPaths.length > 0) {
  console.error(`Playwright artifact safety gate is missing paths: ${missingArtifactPaths.join(", ")}`);
  process.exit(1);
}

const credentialNamesByValue = new Map();
function addCredential(name, value) {
  if (!value) return;
  const names = credentialNamesByValue.get(value) ?? new Set();
  names.add(name);
  credentialNamesByValue.set(value, names);
}

for (const [name, value] of Object.entries(process.env)) {
  if (SECRET_ENV_NAME_PATTERN.test(name)) addCredential(name, value);
}
for (const name of REQUIRED_CREDENTIAL_ENV_NAMES) {
  addCredential(name, process.env[name]);
}
addCredential("E2E_CLERK_USERS", process.env.E2E_CLERK_USERS);
for (const [index, email] of process.env.E2E_CLERK_USERS.split(",")
  .map((value) => value.trim())
  .entries()) {
  addCredential(`E2E_CLERK_USERS[${index}]`, email);
}

function collectFiles(targetPath) {
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Playwright artifact safety gate does not accept symbolic links: ${targetPath}`);
  }
  if (stat.isFile()) return [targetPath];
  if (!stat.isDirectory()) return [];
  return readdirSync(targetPath).flatMap((entry) => collectFiles(path.join(targetPath, entry)));
}

let artifactFiles;
try {
  artifactFiles = requiredArtifactPaths.flatMap(collectFiles);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Playwright artifact safety gate could not inspect artifacts.",
  );
  process.exit(1);
}
if (artifactFiles.length === 0) {
  console.error("Playwright artifact safety gate found no artifact files to inspect.");
  process.exit(1);
}

const findings = [];
for (const artifactFile of artifactFiles) {
  const contents = readFileSync(artifactFile);
  for (const [credential, names] of credentialNamesByValue) {
    const serializedCredential = JSON.stringify(credential).slice(1, -1);
    if (contents.includes(Buffer.from(credential)) || contents.includes(Buffer.from(serializedCredential))) {
      findings.push({ artifactFile, names: [...names] });
    }
  }
}

if (findings.length > 0) {
  console.error("Playwright artifact safety gate found credential values:");
  for (const { artifactFile, names } of findings) {
    console.error(`- ${artifactFile}: ${names.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Playwright artifact safety gate passed: ${artifactFiles.length} files checked against ${credentialNamesByValue.size} credential values.`,
);
