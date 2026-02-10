import { Button, Text, useBreakpointValue, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog } from "@/src/components/ui/Dialog";
import { DAY_LABELS } from "../constants";
import { DaySelector } from "../DaySelector";

type CopyModalProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  sourceDayOfWeek: number;
  onCopy: (targetDays: number[]) => void;
  isLoading?: boolean;
};

export const CopyModal = ({
  isOpen,
  onOpenChange,
  onClose,
  sourceDayOfWeek,
  onCopy,
  isLoading = false,
}: CopyModalProps) => {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const isMobile = useBreakpointValue({ base: true, md: false });

  const handleSubmit = () => {
    onCopy(selectedDays);
    setSelectedDays([]);
  };

  const handleClose = () => {
    setSelectedDays([]);
    onClose();
  };

  const content = (
    <VStack gap={4} align="stretch">
      <Text fontSize="sm" color="gray.600">
        {DAY_LABELS[sourceDayOfWeek]}曜日の設定を他の曜日にコピーします。
      </Text>

      <DaySelector
        selectedDays={selectedDays}
        onChange={setSelectedDays}
        disabledDays={[sourceDayOfWeek]}
        label="コピー先"
      />

      <Text fontSize="xs" color="orange.600">
        選択した曜日の設定は上書きされます
      </Text>

      {isMobile && (
        <VStack gap={2} mt={2}>
          <Button
            w="100%"
            colorPalette="teal"
            onClick={handleSubmit}
            loading={isLoading}
            disabled={selectedDays.length === 0}
          >
            コピーする
          </Button>
          <Button w="100%" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
        </VStack>
      )}
    </VStack>
  );

  if (isMobile) {
    return (
      <BottomSheet title="コピー先を選択" isOpen={isOpen} onOpenChange={onOpenChange}>
        {content}
      </BottomSheet>
    );
  }

  return (
    <Dialog
      title="コピー先を選択"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      submitLabel="コピーする"
      onClose={handleClose}
      isLoading={isLoading}
    >
      {content}
    </Dialog>
  );
};
