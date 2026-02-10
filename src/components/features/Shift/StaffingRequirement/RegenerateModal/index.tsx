import { Button, useBreakpointValue, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog } from "@/src/components/ui/Dialog";
import { AIInputFields } from "../AIInputFields";
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
  const isMobile = useBreakpointValue({ base: true, md: false });

  const handleSubmit = () => {
    const aiInput: AIInput = { shopType, customerCount };

    // TODO: 実際のAI API呼び出しに置き換え
    const generatedStaffing = generateMockStaffing(openTime, closeTime, positions);

    onRegenerate(generatedStaffing, aiInput);
  };

  const content = (
    <VStack gap={4} align="stretch">
      <AIInputFields
        shopType={shopType}
        onShopTypeChange={setShopType}
        customerCount={customerCount}
        onCustomerCountChange={setCustomerCount}
        disabled={isLoading}
      />

      {isMobile && (
        <VStack gap={2} mt={2}>
          <Button
            w="100%"
            colorPalette="teal"
            onClick={handleSubmit}
            loading={isLoading}
            disabled={shopType.trim().length === 0}
          >
            作り直す
          </Button>
          <Button w="100%" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
        </VStack>
      )}
    </VStack>
  );

  if (isMobile) {
    return (
      <BottomSheet title="AIで作り直す" isOpen={isOpen} onOpenChange={onOpenChange}>
        {content}
      </BottomSheet>
    );
  }

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
      {content}
    </Dialog>
  );
};
