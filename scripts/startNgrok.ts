#!/usr/bin/env tsx

import { spawn } from "node:child_process";

const NGROK_PORT = 3000;
const NGROK_API_URL = "http://127.0.0.1:4040/api/tunnels";
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

type NgrokTunnel = {
  public_url?: string;
  proto?: string;
};

type NgrokTunnelsResponse = {
  tunnels?: NgrokTunnel[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const findPublicUrl = async () => {
  const response = await fetch(NGROK_API_URL);

  if (!response.ok) {
    throw new Error(`ngrok API returned ${response.status}`);
  }

  const data = (await response.json()) as NgrokTunnelsResponse;
  const httpsTunnel = data.tunnels?.find((tunnel) => tunnel.proto === "https" && tunnel.public_url);
  const anyTunnel = data.tunnels?.find((tunnel) => tunnel.public_url);

  return httpsTunnel?.public_url ?? anyTunnel?.public_url;
};

const main = async () => {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const ngrok = spawn(npxCommand, ["-y", "ngrok", "http", String(NGROK_PORT)], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  ngrok.stdout.on("data", (data) => process.stdout.write(data));
  ngrok.stderr.on("data", (data) => process.stderr.write(data));

  const stopNgrok = () => {
    if (!ngrok.killed) {
      ngrok.kill();
    }
  };

  process.on("SIGINT", stopNgrok);
  process.on("SIGTERM", stopNgrok);

  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    if (ngrok.exitCode !== null) {
      process.exit(ngrok.exitCode ?? 1);
    }

    try {
      const publicUrl = await findPublicUrl();

      if (publicUrl) {
        console.log(`ngrok public URL: ${publicUrl}`);
        console.log("ngrok inspector: http://127.0.0.1:4040");
        break;
      }
    } catch {
      // ngrok's local API is not ready yet.
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (ngrok.exitCode !== null) {
    process.exit(ngrok.exitCode ?? 1);
  }
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
