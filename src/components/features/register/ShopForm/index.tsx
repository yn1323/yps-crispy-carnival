import { Button, Card, Field, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { type SubmitHandler, useForm } from "react-hook-form";
import { registerShop } from "@/src/components/features/register/ShopForm/actions";
import { toaster } from "@/src/components/ui/toaster";
import { type SchemaType, schema, submitFrequencyOptions } from "./schema";

type Props = {
  callbackRoutingPath?: string;
};

export const ShopForm = ({ callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    const { success } = await registerShop(data);
    if (success) {
      toaster.create({
        description: "店舗登録が完了しました",
        type: "success",
      });
      callbackRoutingPath && navigate({ to: callbackRoutingPath });
    } else {
      toaster.create({
        description: "店舗登録に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Card.Root w="96" p="8">
      <Stack gap="8" w="full">
        <Text fontSize="lg">店舗登録</Text>
        <Stack
          gap="6"
          as="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(onSubmit)(e);
          }}
        >
          <Field.Root invalid={!!errors.shopName}>
            <Field.Label>店舗名</Field.Label>
            <Input {...register("shopName")} placeholder="店舗名" />
            <Field.ErrorText>{errors.shopName?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.openTime}>
            <Field.Label>開店時間</Field.Label>
            <Input {...register("openTime")} type="time" />
            <Field.ErrorText>{errors.openTime?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.closeTime}>
            <Field.Label>閉店時間</Field.Label>
            <Input {...register("closeTime")} type="time" />
            <Field.ErrorText>{errors.closeTime?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.submitFrequency}>
            <Field.Label>シフト提出頻度</Field.Label>

            <NativeSelect.Root {...register("submitFrequency")}>
              <NativeSelect.Field placeholder="選択してください">
                {submitFrequencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>

            <Field.ErrorText>{errors.submitFrequency?.message}</Field.ErrorText>
          </Field.Root>

          <Button variant="solid" colorPalette="teal" type="submit" loading={isSubmitting}>
            登録
          </Button>
        </Stack>
      </Stack>
    </Card.Root>
  );
};
