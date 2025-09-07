import { defaultSystem, ChakraProvider as LibChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider } from "./color-mode";

export const ChakraProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <LibChakraProvider value={defaultSystem}>
      <ColorModeProvider>{children}</ColorModeProvider>
    </LibChakraProvider>
  );
};
