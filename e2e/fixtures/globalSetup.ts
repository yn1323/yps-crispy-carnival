import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup() {
  // workerが失敗時に画面全体のARIA snapshotをerror-context.mdへ保存しないよう、起動前に継承させる。
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
  try {
    // Runner processで一度だけ初期化し、project dependencyを外したburn-inにも安全に継承する。
    await clerkSetup();
  } catch {
    throw new Error("E2E Clerk global setup failed");
  }
}
