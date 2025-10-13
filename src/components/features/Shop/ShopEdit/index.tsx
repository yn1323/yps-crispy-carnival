import {
  Box,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Separator,
  Spacer,
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
import type { Doc } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
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
    getValues,
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
    <Card.Root>
      <Card.Header>
        <Heading size="lg">店舗編集</Heading>
        <Text color="fg.muted" mt="2">
          店舗の基本情報とシフト管理の設定を変更します
        </Text>
      </Card.Header>
      <Card.Body>
        <Stack gap="8" w="full">
          <Stack
            gap="8"
            as="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(onSubmit)(e);
            }}
          >
            {/* 基本情報セクション */}
            <Stack gap="4">
              <Heading size="md" fontWeight="semibold">
                基本情報
              </Heading>
              <Stack gap="6">
                <Field.Root invalid={!!errors.shopName}>
                  <Field.Label>店舗名</Field.Label>
                  <Input {...register("shopName")} placeholder="店舗名" />
                  <Field.ErrorText>{errors.shopName?.message}</Field.ErrorText>
                </Field.Root>

                <Flex direction={{ base: "column", md: "row" }} gap="4">
                  <Field.Root invalid={!!errors.openTime} flex="1">
                    <Field.Label>開店時間</Field.Label>
                    <Input {...register("openTime")} type="time" />
                    <Field.ErrorText>{errors.openTime?.message}</Field.ErrorText>
                  </Field.Root>

                  <Field.Root invalid={!!errors.closeTime} flex="1">
                    <Field.Label>閉店時間</Field.Label>
                    <Input {...register("closeTime")} type="time" />
                    <Field.ErrorText>{errors.closeTime?.message}</Field.ErrorText>
                  </Field.Root>
                </Flex>
              </Stack>
            </Stack>

            <Separator />

            {/* シフト設定セクション */}
            <Stack gap="4">
              <Heading size="md" fontWeight="semibold">
                シフト設定
              </Heading>
              <Flex direction={{ base: "column", md: "row" }} gap="4">
                <Field.Root invalid={!!errors.submitFrequency} flex="1">
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

                <Field.Root invalid={!!errors.timeUnit} flex="1">
                  <Field.Label>シフト入力の時間単位</Field.Label>
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
              </Flex>
            </Stack>

            <Separator />

            {/* オプション機能セクション */}
            <Stack gap="4">
              <Heading size="md" fontWeight="semibold">
                オプション機能
              </Heading>
              <Stack gap="6">
                <Field.Root>
                  <HStack justify="space-between" align="center" w="full" gap={10}>
                    <Box>
                      <Field.Label>タイムカード機能</Field.Label>
                      <Field.HelperText>出退勤の打刻機能</Field.HelperText>
                    </Box>
                    <Box display="flex" alignItems="center" gap="2">
                      <Field.HelperText>利用{watch("useTimeCard") ? "する" : "しない"}</Field.HelperText>
                      <Switch.Root colorPalette="teal" defaultChecked={getValues("useTimeCard")}>
                        <Switch.HiddenInput
                          checked={watch("useTimeCard")}
                          onChange={(e) => setValue("useTimeCard", e.target.checked)}
                        />
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Root>
                    </Box>
                    <Spacer hideBelow="md" />
                  </HStack>
                </Field.Root>

                <Field.Root>
                  <Field.Label>店舗メモ（マネージャー向け）</Field.Label>
                  <Field.HelperText>運営上の注意事項、業務ルール、引き継ぎ事項など</Field.HelperText>
                  <Textarea
                    {...register("description")}
                    placeholder="例: レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など"
                    rows={4}
                  />
                </Field.Root>
              </Stack>
            </Stack>

            <HStack gap="3" justifyContent="flex-end">
              <Button
                variant="solid"
                colorPalette="teal"
                type="submit"
                loading={isSubmitting}
                w={{ base: "full", lg: "auto" }}
              >
                更新
              </Button>
            </HStack>
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};
