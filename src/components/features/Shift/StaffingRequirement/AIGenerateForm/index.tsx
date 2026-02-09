import { Box, Button, Field, Flex, Icon, Input, Text, Textarea, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { LuBot, LuSparkles } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";
import type { AIInput, PositionType, StaffingEntry } from "../types";
import { generateMockStaffing } from "../utils/generateMockStaffing";

type AIGenerateFormProps = {
  openTime: string;
  closeTime: string;
  positions: PositionType[];
  initialAIInput?: AIInput;
  onGenerate: (result: StaffingEntry[], aiInput: AIInput) => void;
  onSkip: () => void;
  isLoading?: boolean;
};

export const AIGenerateForm = ({
  openTime,
  closeTime,
  positions,
  initialAIInput,
  onGenerate,
  onSkip,
  isLoading = false,
}: AIGenerateFormProps) => {
  const [shopType, setShopType] = useState(initialAIInput?.shopType ?? "");
  const [customerCount, setCustomerCount] = useState(initialAIInput?.customerCount ?? "");

  const handleSubmit = async () => {
    const aiInput: AIInput = { shopType, customerCount };

    // TODO: 実際のAI API呼び出しに置き換え
    // 仮の生成ロジック
    const generatedStaffing = generateMockStaffing(openTime, closeTime, positions);

    onGenerate(generatedStaffing, aiInput);
  };

  const isValid = shopType.trim().length > 0;

  return (
    <FormCard icon={LuBot} iconColor="teal.600" title="AIで人員配置を提案">
      <VStack gap={4} align="stretch">
        <Field.Root>
          <Field.Label>どんなお店ですか？</Field.Label>
          <Textarea
            value={shopType}
            onChange={(e) => setShopType(e.target.value)}
            placeholder="例: カフェ、ランチメインで夜は軽め"
            rows={2}
            disabled={isLoading}
          />
        </Field.Root>

        <Field.Root>
          <Field.Label>
            1日の来客数は？
            <Text as="span" fontSize="xs" color="gray.500" ml={2}>
              ざっくりでOK
            </Text>
          </Field.Label>
          <Input
            value={customerCount}
            onChange={(e) => setCustomerCount(e.target.value)}
            placeholder="例: 平日80人、土日120人くらい"
            disabled={isLoading}
          />
        </Field.Root>

        <Box bg="gray.50" p={3} borderRadius="md">
          <Text fontSize="sm" color="gray.600">
            営業時間: {openTime} - {closeTime}
          </Text>
          <Text fontSize="sm" color="gray.600">
            ポジション: {positions.map((p) => p.name).join(", ")}
          </Text>
        </Box>

        <Flex direction="column" gap={3} pt={2}>
          <Button colorPalette="teal" onClick={handleSubmit} disabled={!isValid || isLoading} loading={isLoading}>
            <Icon as={LuSparkles} />
            提案してもらう
          </Button>

          <Text
            as="button"
            fontSize="sm"
            color={isLoading ? "gray.300" : "gray.500"}
            textAlign="center"
            cursor={isLoading ? "not-allowed" : "pointer"}
            _hover={isLoading ? {} : { color: "gray.700", textDecoration: "underline" }}
            onClick={isLoading ? undefined : onSkip}
          >
            手動で入力する場合は スキップ
          </Text>
        </Flex>
      </VStack>
    </FormCard>
  );
};
