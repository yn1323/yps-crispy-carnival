import type { Preview } from "@storybook/react-vite";
// biome-ignore lint/correctness/noUnusedImports: temp
import React from "react";
import { z } from "zod";
import { ChakraProvider } from "../src/components/config/ChakraProvider";
import { ClerkProvider } from "../src/components/config/ClerkProvider";
import { ConvexClientProvider } from "../src/components/config/ConvexProvider";
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
      z.setErrorMap(customErrorMap);
      return (
        <ChakraProvider>
          <ClerkProvider env={import.meta.env.STORYBOOK_CLERK_PUBLISHABLE_KEY ?? ""}>
            <ConvexClientProvider env={import.meta.env.STORYBOOK_CONVEX_URL ?? ""}>
              <Story />
            </ConvexClientProvider>
          </ClerkProvider>
        </ChakraProvider>
      );
    },
    withDummyRouter("/"),
  ],
};

export default preview;
