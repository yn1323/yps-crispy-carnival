import { Field, Input, Textarea, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { Dialog } from "@/src/components/ui/Dialog";
import type { AIInput, PositionType, StaffingEntry } from "../types";
import { generateMockStaffing } from "../utils/generateMockStaffing";

type RegenerateModalProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  initialAIInput?: AIInput;
  onRegenerate: (result: StaffingEntry[], aiInput: AIInput) => void;
  openTime: string;
  closeTime: string;
  positions: PositionType[];
  isLoading?: boolean;
};

export const RegenerateModal = ({
  isOpen,
  onOpenChange,
  onClose,
  initialAIInput,
  onRegenerate,
  openTime,
  closeTime,
  positions,
  isLoading = false,
}: RegenerateModalProps) => {
  const [shopType, setShopType] = useState(initialAIInput?.shopType ?? "");
  const [customerCount, setCustomerCount] = useState(initialAIInput?.customerCount ?? "");

  const handleSubmit = () => {
    const aiInput: AIInput = { shopType, customerCount };

    // TODO: 実際のAI API呼び出しに置き換え
    const generatedStaffing = generateMockStaffing(openTime, closeTime, positions);

    onRegenerate(generatedStaffing, aiInput);
  };

  return (
    <Dialog
      title="AIで作り直す"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      submitLabel="作り直す"
      onClose={onClose}
      isLoading={isLoading}
      isSubmitDisabled={shopType.trim().length === 0}
    >
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
          <Field.Label>1日の来客数は？（ざっくりでOK）</Field.Label>
          <Input
            value={customerCount}
            onChange={(e) => setCustomerCount(e.target.value)}
            placeholder="例: 平日80人、土日120人くらい"
            disabled={isLoading}
          />
        </Field.Root>
      </VStack>
    </Dialog>
  );
};
