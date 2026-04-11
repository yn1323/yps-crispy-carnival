import type { Preview } from "@storybook/react-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { ChakraProvider } from "../src/components/config/ChakraProvider";
import { customErrorMap } from "../src/configs/zod/zop-setup";
import { withDummyRouter } from "./withDummyRouter";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
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
