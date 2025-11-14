import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { ShopForm } from "../ShopForm";
import { type SchemaType, schema } from "./schema";

type Props = {
  callbackRoutingPath?: string;
};

export const ShopRegister = ({ callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);
  const createShop = useMutation(api.shop.createShop);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: "30",
      submitFrequency: "2w",
      useTimeCard: true,
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
      const result = await createShop({
        shopName: data.shopName,
        openTime: data.openTime,
        closeTime: data.closeTime,
        timeUnit: data.timeUnit ? Number(data.timeUnit) : 15,
        submitFrequency: data.submitFrequency,
        useTimeCard: data.useTimeCard,
        description: data.description,
        authId: user.authId,
      });

      if (result.success) {
        toaster.create({
          description: "店舗登録が完了しました",
          type: "success",
        });
        navigate({ to: callbackRoutingPath ?? "/shops" });
      }
    } catch (error) {
      console.error("店舗登録エラー:", error);
      toaster.create({
        description: "店舗登録に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <ShopForm
      mode="create"
      register={register}
      errors={errors}
      watch={watch}
      setValue={setValue}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
    />
  );
};
