import { Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { Dialog } from "@/src/components/ui/Dialog";
import { DaySelector } from "../DaySelector";

type CopyModalProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  sourceDayOfWeek: number;
  onCopy: (targetDays: number[]) => void;
  isLoading?: boolean;
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const CopyModal = ({
  isOpen,
  onOpenChange,
  onClose,
  sourceDayOfWeek,
  onCopy,
  isLoading = false,
}: CopyModalProps) => {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const handleSubmit = () => {
    onCopy(selectedDays);
    setSelectedDays([]);
  };

  const handleClose = () => {
    setSelectedDays([]);
    onClose();
  };

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
      </VStack>
    </Dialog>
  );
};
