import { sleep } from "./index";

describe("sleep", () => {
  it("指定した時間だけ待機すること", async () => {
    const startTime = Date.now();
    const waitTime = 100;

    await sleep(waitTime);

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    // 実行時間にはJSの実行時間も含まれるため、許容範囲を設ける
    expect(elapsedTime).toBeGreaterThanOrEqual(waitTime);
    expect(elapsedTime).toBeLessThan(waitTime + 50);
  });
});
