import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { getDayStyle } from "./dayStyle";
import type { ShiftEntry } from "./index";

dayjs.locale("ja");

type ConfirmViewProps = {
  entries: ShiftEntry[];
  onSubmit: () => Promise<void>;
  onBack: () => void;
};

export const ConfirmView = ({ entries, onSubmit, onBack }: ConfirmViewProps) => {
  const availableCount = entries.filter((e) => e.isAvailable === true).length;
  const totalDays = entries.length;

  return (
    <VStack gap={4} align="stretch">
      <Box bg="white" borderRadius="md" shadow="xs" p={4}>
        <Text fontWeight="bold" fontSize="md" mb={3}>
          入力内容の確認
        </Text>

        <VStack gap={1} align="stretch">
          {entries.map((entry) => {
            const d = dayjs(entry.date);
            const dayStyle = getDayStyle(entry.date);
            return (
              <HStack key={entry.date} gap={3} py={1} borderBottom="1px solid" borderColor="gray.100">
                <Text fontSize="sm" fontWeight="medium" color={dayStyle.textColor} minW="70px">
                  {d.format("M/D(ddd)")}
                </Text>
                {entry.isAvailable ? (
                  <Text fontSize="sm" color="gray.700">
                    {entry.startTime}〜{entry.endTime}
                  </Text>
                ) : (
                  <Text fontSize="sm" color="gray.500">
                    -
                  </Text>
                )}
              </HStack>
            );
          })}
        </VStack>

        <HStack gap={1} mt={3} justifyContent="center">
          <Text fontSize="sm" color="teal.600" fontWeight="medium">
            出勤可能: {availableCount}日 / {totalDays}日中
          </Text>
        </HStack>
      </Box>

      <Button colorPalette="teal" size="lg" w="full" onClick={onSubmit}>
        この内容で提出する
      </Button>

      <Button variant="ghost" size="sm" onClick={onBack}>
        入力画面に戻る
      </Button>
    </VStack>
  );
};
