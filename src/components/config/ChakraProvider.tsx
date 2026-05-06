import { ChakraProvider as LibChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider } from "@/src/components/config/color-mode";
import { system } from "@/src/configs/theme";

export const ChakraProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <LibChakraProvider value={system}>
      <ColorModeProvider>{children}</ColorModeProvider>
    </LibChakraProvider>
  );
};
