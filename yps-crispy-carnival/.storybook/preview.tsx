import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ClerkProvider } from "@clerk/clerk-react";
import type { Preview } from "@storybook/react-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { ConvexClientProvider } from "../src/components/config/ConvexProvider";
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
        <ClerkProvider
          // STORYBOOK_CLERK_PUBLISHABLE_KEY・・・Vitest
          // VITE_CLERK_PUBLISHABLE_KEY
          publishableKey={process.env.STORYBOOK_CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? ""}
        >
          <ConvexClientProvider>
            <ChakraProvider value={defaultSystem}>
              <Story />
            </ChakraProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      );
    },
  ],
};

export default preview;
