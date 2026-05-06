#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { config } from "dotenv";

const NGROK_AUTHTOKEN_KEY = "NGROK_AUTHTOKEN";

const main = () => {
  config({ quiet: true });

  const authtoken = process.env[NGROK_AUTHTOKEN_KEY]?.trim();

  if (!authtoken) {
    console.error(`${NGROK_AUTHTOKEN_KEY} is not set.`);
    console.error("Add it to .env first:");
    console.error(`${NGROK_AUTHTOKEN_KEY}=your_ngrok_authtoken`);
    console.error("You can get the token from https://dashboard.ngrok.com/get-started/your-authtoken");
    process.exit(1);
  }

  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

  try {
    execFileSync(npxCommand, ["-y", "ngrok", "config", "add-authtoken", authtoken], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: process.platform === "win32",
    });
  } catch {
    console.error("Failed to configure ngrok authtoken.");
    console.error("Check that npx can run ngrok, then try again.");
    process.exit(1);
  }
};

main();
