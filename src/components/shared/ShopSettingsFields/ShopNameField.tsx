import { Field, Input } from "@chakra-ui/react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { SHOP_NAME_MAX_LENGTH } from "@/convex/constants";

export type ShopNameFieldProps = {
  registration: UseFormRegisterReturn<"shopName">;
  invalid: boolean;
  errorMessage?: string;
  hideLabel?: boolean;
};

export function ShopNameField({ registration, invalid, errorMessage, hideLabel = false }: ShopNameFieldProps) {
  return (
    <Field.Root invalid={invalid}>
      {!hideLabel && <Field.Label>お店の名前</Field.Label>}
      <Input
        aria-label={hideLabel ? "お店の名前" : undefined}
        placeholder="サンプル店舗"
        maxLength={SHOP_NAME_MAX_LENGTH}
        {...registration}
      />
      {invalid && <Field.ErrorText>{errorMessage}</Field.ErrorText>}
    </Field.Root>
  );
}
