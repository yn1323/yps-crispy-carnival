import {
  Box,
  Button,
  Card,
  Field,
  Flex,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { type SchemaType, schema, submitFrequencyOptions, timeUnitOptions } from "./schema";

type Props = {
  callbackRoutingPath?: string;
};

export const ShopForm = ({ callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);
  const createShop = useMutation(api.shop.createShop);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: "1",
      submitFrequency: "1w",
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
        useTimeCard: data.useTimeCard ?? true,
        description: data.description,
        authId: user.authId,
      });

      if (result.success) {
        toaster.create({
          description: "店舗登録が完了しました",
          type: "success",
        });
        if (callbackRoutingPath) {
          navigate({ to: callbackRoutingPath });
        } else {
          navigate({ to: `/shops/${result.data.shopId}` });
        }
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
            <NativeSelectRoot>
              <NativeSelectField {...register("submitFrequency")} placeholder="選択してください">
                {submitFrequencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
            <Field.ErrorText>{errors.submitFrequency?.message}</Field.ErrorText>
          </Field.Root>

          {/* シフト時間単位 */}
          <Field.Root invalid={!!errors.timeUnit}>
            <Field.Label>シフト時間単位</Field.Label>
            <Field.HelperText>シフトを何分単位で管理するか設定します</Field.HelperText>
            <NativeSelectRoot>
              <NativeSelectField {...register("timeUnit")}>
                {timeUnitOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
            <Field.ErrorText>{errors.timeUnit?.message}</Field.ErrorText>
          </Field.Root>

          {/* タイムカード機能 */}
          <Field.Root>
            <Flex justify="space-between" align="center">
              <Box>
                <Field.Label>タイムカード機能</Field.Label>
                <Field.HelperText>出退勤の打刻機能を使用するかどうか</Field.HelperText>
              </Box>
              <Switch.Root
                checked={watch("useTimeCard")}
                onCheckedChange={(e) => setValue("useTimeCard", e.checked)}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Root>
            </Flex>
          </Field.Root>

          {/* 店舗メモ */}
          <Field.Root>
            <Field.Label>店舗メモ（マネージャー向け）</Field.Label>
            <Field.HelperText>運営上の注意事項、業務ルール、引き継ぎ事項など</Field.HelperText>
            <Textarea
              {...register("description")}
              placeholder="例: レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など"
              rows={4}
            />
          </Field.Root>

          <Button variant="solid" colorPalette="teal" type="submit" loading={isSubmitting}>
            登録
          </Button>
        </Stack>
      </Stack>
    </Card.Root>
  );
};
