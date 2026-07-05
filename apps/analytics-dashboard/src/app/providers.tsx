import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { system } from "@/styles/theme";
import { queryClient } from "./queryClient";

export const AppProviders = ({ children }: { children: ReactNode }) => {
  return (
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ChakraProvider>
  );
};
