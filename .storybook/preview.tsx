import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ClerkProvider } from "@clerk/nextjs";
import type { Preview } from "@storybook/nextjs-vite";
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
          // NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY・・・Chromatic
          publishableKey={process.env.STORYBOOK_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
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
