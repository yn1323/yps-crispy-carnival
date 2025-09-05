import { defaultSystem, ChakraProvider as LibChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";

export const ChakraProvider = (props: ColorModeProviderProps) => {
  return (
    <LibChakraProvider value={defaultSystem}>
      <ColorModeProvider {...props} />
    </LibChakraProvider>
  );
};
