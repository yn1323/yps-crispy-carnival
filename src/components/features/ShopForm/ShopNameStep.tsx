import { Field, Input } from "@chakra-ui/react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { SHOP_NAME_MAX_LENGTH } from "@/convex/constants";

export type ShopNameStepProps = {
  registration: UseFormRegisterReturn<"shopName">;
  invalid: boolean;
  errorMessage?: string;
};

export const ShopNameStep = ({ registration, invalid, errorMessage }: ShopNameStepProps) => (
  <Field.Root invalid={invalid}>
    <Field.Label>お店の名前</Field.Label>
    <Input placeholder="例：居酒屋たなか" maxLength={SHOP_NAME_MAX_LENGTH} {...registration} />
    {invalid && <Field.ErrorText>{errorMessage}</Field.ErrorText>}
  </Field.Root>
);
