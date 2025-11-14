import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { ShopForm } from "../ShopForm";
import { type SchemaType, schema, submitFrequencyOptions, timeUnitOptions } from "./schema";

type Props = {
  shop: Doc<"shops">;
  callbackRoutingPath?: string;
};

export const ShopEdit = ({ shop, callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);
  const updateShop = useMutation(api.shop.updateShop);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      shopName: shop.shopName,
      openTime: shop.openTime,
      closeTime: shop.closeTime,
      timeUnit: String(shop.timeUnit),
      submitFrequency: shop.submitFrequency,
      useTimeCard: shop.useTimeCard,
      description: shop.description ?? "",
    },
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    if (!user.authId) {
      toaster.create({
        description: "ログインが必要です",
        type: "error",
      });
      return;
    }

    try {
      await updateShop({
        shopId: shop._id,
        authId: user.authId,
        shopName: data.shopName,
        openTime: data.openTime,
        closeTime: data.closeTime,
        timeUnit: data.timeUnit ? Number(data.timeUnit) : 15,
        submitFrequency: data.submitFrequency,
        useTimeCard: data.useTimeCard,
        description: data.description,
      });

      toaster.create({
        description: "店舗情報を更新しました",
        type: "success",
      });
      navigate({ to: callbackRoutingPath ?? `/shops/${shop._id}` });
    } catch (error) {
      console.error("店舗更新エラー:", error);
      toaster.create({
        description: "店舗情報の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <ShopForm
      mode="edit"
      register={register}
      errors={errors}
      watch={watch}
      setValue={setValue}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
    />
  );
};

// submitFrequencyOptions と timeUnitOptions のエクスポート（既存コードとの互換性のため）
export { submitFrequencyOptions, timeUnitOptions };
