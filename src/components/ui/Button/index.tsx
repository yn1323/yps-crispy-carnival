import {
  Button as ChakraButton,
  type ButtonProps as ChakraButtonProps,
  IconButton as ChakraIconButton,
  type IconButtonProps as ChakraIconButtonProps,
} from "@chakra-ui/react";
import { forwardRef } from "react";

type AppButtonVariant = NonNullable<ChakraButtonProps["variant"]> | "outlineOnTint";

export interface ButtonProps extends Omit<ChakraButtonProps, "variant"> {
  variant?: AppButtonVariant;
}

export interface IconButtonProps extends Omit<ChakraIconButtonProps, "variant"> {
  variant?: AppButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant, ...props }, ref) => (
  <ChakraButton ref={ref} variant={variant as ChakraButtonProps["variant"]} {...props} />
));

Button.displayName = "Button";

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({ variant, ...props }, ref) => (
  <ChakraIconButton ref={ref} variant={variant as ChakraIconButtonProps["variant"]} {...props} />
));

IconButton.displayName = "IconButton";
