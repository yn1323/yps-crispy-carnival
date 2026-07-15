import { ChakraProvider as LibChakraProvider } from "@chakra-ui/react";
import { system } from "@/src/configs/theme";
import { ColorModeProvider } from "@/src/providers/ColorModeProvider";

export const ChakraProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <LibChakraProvider value={system}>
      <ColorModeProvider>{children}</ColorModeProvider>
    </LibChakraProvider>
  );
};
