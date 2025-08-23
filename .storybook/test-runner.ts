import type { TestRunnerConfig } from "@storybook/test-runner";
import { screenshot } from "storycap-testrun";

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    await screenshot(page, context, {
      flakiness: {
        retake: {
          interval: 100, // 100ms
          retries: 10,
        },
      },
    });
  },
};

export default config;
