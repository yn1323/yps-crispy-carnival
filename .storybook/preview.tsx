import type { Preview } from "@storybook/react-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { toaster } from "../src/components/ui/toaster";
import { customErrorMap } from "../src/configs/zod/zop-setup";
import { ChakraProvider } from "../src/providers/ChakraProvider";
import { applyFixedStorybookDate } from "./fixedDate";
import { withDummyRouter } from "./withDummyRouter";

const nativeHTMLElementFocus = typeof HTMLElement === "undefined" ? undefined : HTMLElement.prototype.focus;
const storybookFocusGetterMarker = Symbol("storybookFocusGetterMarker");

function applyStorybookDocumentDefaults() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = "ja";
}

function makeStorybookFocusGetterPrototypeSafe() {
  if (typeof HTMLElement === "undefined" || !nativeHTMLElementFocus) return {};

  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "focus");
  const storybookGetter = descriptor?.get;
  if (!storybookGetter || storybookFocusGetterMarker in storybookGetter) return {};

  const safeGetter = function (this: HTMLElement) {
    if (this === HTMLElement.prototype) return nativeHTMLElementFocus;
    return storybookGetter.call(this);
  };
  Object.defineProperty(safeGetter, storybookFocusGetterMarker, { value: true });
  Object.defineProperty(HTMLElement.prototype, "focus", {
    configurable: descriptor.configurable,
    get: safeGetter,
    set: descriptor.set,
  });

  return {};
}

applyFixedStorybookDate();
applyStorybookDocumentDefaults();

const preview: Preview = {
  // 通知storeはmodule singletonなので、前のStoryの通知と待機queueを引き継がない。
  beforeEach: () => {
    toaster.remove();
    return () => {
      toaster.remove();
    };
  },
  // Storybook 10.5 instruments focus with an instance-only getter. Zag reads the
  // prototype while initializing focus-visible, so make that access safe after
  // Storybook's core loaders have installed their instrumentation.
  loaders: [makeStorybookFocusGetterPrototypeSafe],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      defaultViewport: "desktop",
      options: {
        desktop: {
          name: "Desktop",
          styles: {
            width: "1280px",
            height: "720px",
          },
        },
        mobile1: {
          name: "Mobile Small",
          styles: {
            width: "320px",
            height: "568px",
          },
        },
        mobile2: {
          name: "Mobile Large",
          styles: {
            width: "414px",
            height: "896px",
          },
        },
        mobile2Landscape: {
          name: "Mobile Large Landscape",
          styles: {
            width: "896px",
            height: "414px",
          },
        },
      },
    },
  },
  decorators: [
    (Story) => {
      z.config({ customError: customErrorMap });
      return (
        <ChakraProvider>
          <Story />
        </ChakraProvider>
      );
    },
    withDummyRouter("/"),
  ],
};

export default preview;
