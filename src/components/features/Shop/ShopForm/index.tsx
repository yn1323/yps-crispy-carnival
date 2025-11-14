import {
  Box,
  Button,
  Container,
  Field,
  Flex,
  Grid,
  GridItem,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Switch,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { LuCalendar, LuSettings, LuStore } from "react-icons/lu";
import { type SchemaType, submitFrequencyOptions, timeUnitOptions } from "../ShopRegister/schema";

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
    <Container maxW="3xl" p={{ base: 4, md: 8 }}>
      {/* ヘッダー */}
      <Box mb={{ base: 4, md: 6 }}>
        <Flex align="center" gap="3" mb="2">
          <Flex p="2" bg="teal.50" borderRadius="lg">
            <LuStore size={20} color="var(--chakra-colors-teal-600)" />
          </Flex>
          <Text as="h2" color="gray.900">
            {mode === "create" ? "店舗登録" : "店舗編集"}
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600">
          {mode === "create"
            ? "店舗の基本情報とシフト管理の設定を行います"
            : "店舗の基本情報とシフト管理の設定を変更します"}
        </Text>
      </Box>

      <Box as="form" onSubmit={onSubmit}>
        <VStack gap="6">
          {/* 基本情報 */}
          <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
            <Flex align="center" gap="2" mb="4">
              <LuStore size={16} color="var(--chakra-colors-gray-700)" />
              <Text as="h3" color="gray.900">
                基本情報
              </Text>
            </Flex>
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
          </Box>

          {/* シフト設定 */}
          <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
            <Flex align="center" gap="2" mb="4">
              <LuCalendar size={16} color="var(--chakra-colors-gray-700)" />
              <Text as="h3" color="gray.900">
                シフト設定
              </Text>
            </Flex>
            <VStack gap="4" align="stretch">
              <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="4">
                {/* シフト提出頻度 */}
                <GridItem>
                  <Field.Root invalid={!!errors.submitFrequency}>
                    <Field.Label>シフト提出期限</Field.Label>
                    <Field.HelperText>スタッフがシフトを提出する期限のサイクル</Field.HelperText>
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
                </GridItem>

                {/* 時間単位 */}
                <GridItem>
                  <Field.Root invalid={!!errors.timeUnit}>
                    <Field.Label>シフト入力の時間単位</Field.Label>
                    <Field.HelperText>シフト時間の最小入力単位</Field.HelperText>
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
                </GridItem>
              </Grid>
            </VStack>
          </Box>

          {/* オプション機能 */}
          <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
            <Flex align="center" gap="2" mb="4">
              <LuSettings size={16} color="var(--chakra-colors-gray-700)" />
              <Text as="h3" color="gray.900">
                オプション機能
              </Text>
            </Flex>
            <VStack gap="4" align="stretch">
              {/* タイムカード機能 */}
              <Flex align="center" justify="space-between" p="4" bg="gray.50" borderRadius="lg">
                <Box flex="1">
                  <Text fontSize="sm" color="gray.900" cursor="pointer">
                    タイムカード機能
                  </Text>
                  <Text fontSize="xs" color="gray.600" mt="1">
                    出退勤の打刻機能を有効にする
                  </Text>
                </Box>
                <Switch.Root
                  colorPalette="teal"
                  checked={watch("useTimeCard")}
                  onCheckedChange={(details) => setValue("useTimeCard", details.checked)}
                  ml="4"
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Flex>

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
          </Box>

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
    </Container>
  );
};
