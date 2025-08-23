import type { ScreenshotParameters } from "storycap-testrun";

declare module "@storybook/react" {
  interface Parameters {
    screenshot?: ScreenshotParameters;
  }
}
