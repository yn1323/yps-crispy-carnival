import { Box, Button, Field, Flex, Grid, GridItem, Input, Textarea, VStack } from "@chakra-ui/react";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { LuCalendar, LuSettings, LuStore } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";
import { Select } from "@/src/components/ui/Select";
import { type SchemaType, submitFrequencyOptions, timeUnitOptions } from "./schema";

type ShopFormProps = {
  mode: "create" | "edit";
  register: UseFormRegister<SchemaType>;
  errors: FieldErrors<SchemaType>;
  watch: UseFormWatch<SchemaType>;
  setValue: UseFormSetValue<SchemaType>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export const ShopForm = ({ mode, register, errors, watch, setValue, isSubmitting, onSubmit }: ShopFormProps) => {
  return (
    <Box as="form" onSubmit={onSubmit}>
      <VStack gap="6">
        {/* 基本情報 */}
        <FormCard icon={LuStore} iconColor="gray.700" title="基本情報">
          <VStack gap="4" align="stretch">
            {/* 店舗名 */}
            <Field.Root invalid={!!errors.shopName}>
              <Field.Label>店舗名</Field.Label>
              <Input {...register("shopName")} placeholder="店舗名" />
              <Field.ErrorText>{errors.shopName?.message}</Field.ErrorText>
            </Field.Root>

            {/* 営業時間 */}
            <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="4">
              <GridItem>
                <Field.Root invalid={!!errors.openTime}>
                  <Field.Label>開店時間</Field.Label>
                  <Input {...register("openTime")} type="time" />
                  <Field.ErrorText>{errors.openTime?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>
              <GridItem>
                <Field.Root invalid={!!errors.closeTime}>
                  <Field.Label>閉店時間</Field.Label>
                  <Input {...register("closeTime")} type="time" />
                  <Field.ErrorText>{errors.closeTime?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>
            </Grid>
          </VStack>
        </FormCard>

        {/* シフト設定 */}
        <FormCard icon={LuCalendar} iconColor="gray.700" title="シフト設定">
          <VStack gap="4" align="stretch">
            <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="4">
              {/* シフト提出頻度 */}
              <GridItem>
                <Field.Root invalid={!!errors.submitFrequency}>
                  <Field.Label>シフト提出期限</Field.Label>
                  <Field.HelperText>スタッフがシフトを提出する期限のサイクル</Field.HelperText>
                  <Select
                    items={submitFrequencyOptions}
                    value={watch("submitFrequency")}
                    onChange={(value) => setValue("submitFrequency", value)}
                    invalid={!!errors.submitFrequency}
                    placeholder="選択してください"
                  />
                  <Field.ErrorText>{errors.submitFrequency?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>

              {/* 時間単位 */}
              <GridItem>
                <Field.Root invalid={!!errors.timeUnit}>
                  <Field.Label>シフト入力の時間単位</Field.Label>
                  <Field.HelperText>シフト時間の最小入力単位</Field.HelperText>
                  <Select
                    items={timeUnitOptions}
                    value={watch("timeUnit")}
                    onChange={(value) => setValue("timeUnit", value)}
                    invalid={!!errors.timeUnit}
                    placeholder="選択してください"
                  />
                  <Field.ErrorText>{errors.timeUnit?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>
            </Grid>
          </VStack>
        </FormCard>

        {/* オプション機能 */}
        <FormCard icon={LuSettings} iconColor="gray.700" title="オプション機能">
          <VStack gap="4" align="stretch">
            {/* 店舗メモ */}
            <Field.Root>
              <Field.Label>店舗メモ（マネージャー向け）</Field.Label>
              <Field.HelperText>管理上の注意事項、業務ルール、引き継ぎ事項など</Field.HelperText>
              <Textarea
                {...register("description")}
                placeholder="例：レジ締めの注意点、翌週の準備事項、引き継ぎルール、緊急時の連絡先など"
                minH="120px"
                resize="none"
              />
            </Field.Root>
          </VStack>
        </FormCard>

        {/* 送信ボタン */}
        <Flex direction={{ base: "column-reverse", sm: "row" }} gap="3" pt="2" w="full">
          <Button
            type="submit"
            disabled={isSubmitting}
            flex={{ base: "1", sm: "initial" }}
            colorPalette="teal"
            loading={isSubmitting}
            w={{ base: "full", sm: "auto" }}
          >
            {mode === "create" ? "登録" : "更新"}
          </Button>
        </Flex>
      </VStack>
    </Box>
  );
};
