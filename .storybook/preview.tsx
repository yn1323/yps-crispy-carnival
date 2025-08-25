import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { Preview } from "@storybook/nextjs-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { customErrorMap } from "../src/configs/zod/zop-setup";

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
      z.setErrorMap(customErrorMap);
      return (
        <ChakraProvider value={defaultSystem}>
          <Story />
        </ChakraProvider>
      );
    },
  ],
};

export default preview;
