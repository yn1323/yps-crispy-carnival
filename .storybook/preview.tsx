import type { Preview } from "@storybook/react-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { ChakraProvider } from "../src/components/config/ChakraProvider";
import { customErrorMap } from "../src/configs/zod/zop-setup";
import { applyFixedStorybookDate } from "./fixedDate";
import { withDummyRouter } from "./withDummyRouter";

function applyStorybookDocumentDefaults() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = "ja";
}

applyFixedStorybookDate();
applyStorybookDocumentDefaults();

const preview: Preview = {
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
