import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup() {
  try {
    // Runner processで一度だけ初期化し、project dependencyを外したburn-inにも安全に継承する。
    await clerkSetup();
  } catch {
    throw new Error("E2E Clerk global setup failed");
  }
}
