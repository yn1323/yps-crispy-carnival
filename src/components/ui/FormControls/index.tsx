import {
  Input as ChakraInput,
  type InputProps as ChakraInputProps,
  NativeSelect as ChakraNativeSelect,
  type NativeSelectFieldProps as ChakraNativeSelectFieldProps,
  Textarea as ChakraTextarea,
  type TextareaProps as ChakraTextareaProps,
} from "@chakra-ui/react";
import { forwardRef } from "react";

type AuthAutoComplete = "email" | "current-password" | "new-password" | "one-time-code";

type AutoCompletePolicy =
  | {
      autocompletePolicy?: "off";
      autoComplete?: never;
    }
  | {
      autocompletePolicy: "auth";
      autoComplete: AuthAutoComplete;
    };

export type InputProps = Omit<ChakraInputProps, "autoComplete"> & AutoCompletePolicy;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ autoComplete, autocompletePolicy = "off", ...props }, ref) => (
    <ChakraInput ref={ref} {...props} autoComplete={autocompletePolicy === "auth" ? autoComplete : "off"} />
  ),
);

Input.displayName = "Input";

export type TextareaProps = Omit<ChakraTextareaProps, "autoComplete">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => (
  <ChakraTextarea ref={ref} {...props} autoComplete="off" />
));

Textarea.displayName = "Textarea";

export type NativeSelectFieldProps = Omit<ChakraNativeSelectFieldProps, "autoComplete">;

const NativeSelectField = forwardRef<HTMLSelectElement, NativeSelectFieldProps>((props, ref) => (
  <ChakraNativeSelect.Field ref={ref} {...props} autoComplete="off" />
));

NativeSelectField.displayName = "NativeSelectField";

export const NativeSelect = {
  ...ChakraNativeSelect,
  Field: NativeSelectField,
};
