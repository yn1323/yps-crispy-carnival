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
      z.config({ customError: customErrorMap });
      return (
        <ChakraProvider>
          {/** biome-ignore lint/suspicious/noExplicitAny: temp */}
          <ClerkProvider env={(import.meta as any).env.STORYBOOK_CLERK_PUBLISHABLE_KEY ?? ""}>
            {/** biome-ignore lint/suspicious/noExplicitAny: temp */}
            <ConvexClientProvider env={(import.meta as any).env.STORYBOOK_CONVEX_URL ?? ""}>
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
