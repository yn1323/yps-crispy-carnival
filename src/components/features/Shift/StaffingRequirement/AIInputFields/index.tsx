import { Field, Input, Text, Textarea, VStack } from "@chakra-ui/react";

type AIInputFieldsProps = {
  shopType: string;
  onShopTypeChange: (value: string) => void;
  customerCount: string;
  onCustomerCountChange: (value: string) => void;
  disabled?: boolean;
};

export const AIInputFields = ({
  shopType,
  onShopTypeChange,
  customerCount,
  onCustomerCountChange,
  disabled = false,
}: AIInputFieldsProps) => (
  <VStack gap={4} align="stretch">
    <Text fontSize="sm" color="gray.500">
      AIが必要人員を提案するための参考情報です。
      <br />
      詳しく書くほど精度が上がります。
    </Text>

    <Field.Root>
      <Field.Label>どんなお店ですか？</Field.Label>
      <Textarea
        value={shopType}
        onChange={(e) => onShopTypeChange(e.target.value)}
        placeholder="例: カフェ、ランチメインで夜は軽め。駅近。1日の売上〇〇万円程度。"
        rows={2}
        disabled={disabled}
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
        onChange={(e) => onCustomerCountChange(e.target.value)}
        placeholder="例: 平日80人、土日120人くらい"
        disabled={disabled}
      />
    </Field.Root>
  </VStack>
);
