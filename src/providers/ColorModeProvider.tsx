import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider } from "next-themes";

export type ColorModeProviderProps = ThemeProviderProps;

export const ColorModeProvider = (props: ColorModeProviderProps) => {
  return <ThemeProvider attribute="class" disableTransitionOnChange {...props} forcedTheme="light" />;
};
