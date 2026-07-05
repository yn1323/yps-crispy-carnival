import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  preflight: true,
  cssVarsPrefix: "analytics",
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Inter, system-ui, sans-serif" },
        body: { value: "Inter, system-ui, sans-serif" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
