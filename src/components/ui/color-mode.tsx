"use client";

import type { SpanProps } from "@chakra-ui/react";
import { Span } from "@chakra-ui/react";
import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider } from "next-themes";
import * as React from "react";

export interface ColorModeProviderProps extends ThemeProviderProps {}

export function ColorModeProvider(props: ColorModeProviderProps) {
  // ライトモード固定
  return <ThemeProvider attribute="class" disableTransitionOnChange {...props} forcedTheme="light" />;
}

export type ColorMode = "light" | "dark";

export interface UseColorModeReturn {
  colorMode: ColorMode;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
}

export function useColorMode(): UseColorModeReturn {
  return {
    colorMode: "light" as ColorMode,
    setColorMode: () => {}, // ライト固定のため何もしない
    toggleColorMode: () => {}, // ライト固定のため何もしない
  };
}

export function useColorModeValue<T>(light: T, dark: T) {
  return light; // ライト固定のため常にlight値を返す
}

export const LightMode = React.forwardRef<HTMLSpanElement, SpanProps>(function LightMode(props, ref) {
  return (
    <Span
      color="fg"
      display="contents"
      className="chakra-theme light"
      colorPalette="gray"
      colorScheme="light"
      ref={ref}
      {...props}
    />
  );
});"use client";

import type { SpanProps } from "@chakra-ui/react";
import { Span } from "@chakra-ui/react";
import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider } from "next-themes";
import * as React from "react";

export interface ColorModeProviderProps extends ThemeProviderProps {}

export function ColorModeProvider(props: ColorModeProviderProps) {
  // ライトモード固定
  return <ThemeProvider attribute="class" disableTransitionOnChange {...props} forcedTheme="light" />;
}

export type ColorMode = "light" | "dark";

export interface UseColorModeReturn {
  colorMode: ColorMode;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
}

export function useColorMode(): UseColorModeReturn {
  return {
    colorMode: "light" as ColorMode,
    setColorMode: () => {}, // ライト固定のため何もしない
    toggleColorMode: () => {}, // ライト固定のため何もしない
  };
}

export function useColorModeValue<T>(light: T, dark: T) {
  return light; // ライト固定のため常にlight値を返す
}

export const LightMode = React.forwardRef<HTMLSpanElement, SpanProps>(function LightMode(props, ref) {
  return (
    <Span
      color="fg"
      display="contents"
      className="chakra-theme light"
      colorPalette="gray"
      colorScheme="light"
      ref={ref}
      {...props}
    />
  );
});