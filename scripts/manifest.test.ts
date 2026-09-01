import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Web App Manifest", () => {
  it("既存PWAの識別子を維持し、ホーム画面からstandaloneでDashboardを開く", async () => {
    const source = await readFile(new URL("../public/manifest.json", import.meta.url), "utf-8");
    const manifest = JSON.parse(source) as { display?: string; id?: string; start_url?: string };

    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
  });
});
