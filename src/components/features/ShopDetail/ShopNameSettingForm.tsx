import { Flex, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { shopNameSchema } from "@/convex/shop/schemas";
import { ShopNameField } from "@/src/components/shared/ShopSettingsFields";
import { Button } from "@/src/components/ui/Button";
import type { UpdateShopSetting } from "./types";

const schema = z.object({ shopName: shopNameSchema });
type FormData = z.infer<typeof schema>;

type Props = {
  shopId: string;
  shopName: string;
  labelledBy: string;
  disabled: boolean;
  isBusy: boolean;
  isUpdating: boolean;
  onUpdate: UpdateShopSetting;
};

export function ShopNameSettingForm({ shopId, shopName, labelledBy, disabled, isBusy, isUpdating, onUpdate }: Props) {
  const formId = `shop-detail-name-${shopId}`;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { shopName },
  });

  return (
    <form
      id={formId}
      aria-labelledby={labelledBy}
      noValidate
      onSubmit={handleSubmit(async (data) => {
        await onUpdate({ kind: "shopName", shopName: data.shopName });
      })}
    >
      <fieldset disabled={disabled || isBusy} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <Stack gap={5}>
          <ShopNameField
            registration={register("shopName")}
            invalid={!!errors.shopName}
            errorMessage={errors.shopName?.message}
            hideLabel
          />
          <Flex justify="flex-end">
            <Button type="submit" colorPalette="teal" loading={isUpdating}>
              店舗名を更新
            </Button>
          </Flex>
        </Stack>
      </fieldset>
    </form>
  );
}
