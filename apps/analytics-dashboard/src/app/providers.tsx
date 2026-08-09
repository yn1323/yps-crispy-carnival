import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { system } from "@/styles/theme";
import { AnalyticsEnvironmentProvider } from "./analyticsEnvironment";
import { queryClient } from "./queryClient";

export const AppProviders = ({ children }: { children: ReactNode }) => {
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <AnalyticsEnvironmentProvider>{children}</AnalyticsEnvironmentProvider>
      </QueryClientProvider>
    </ChakraProvider>
  );
};
