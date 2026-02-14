import { Box, Button, Center, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import { LuCircleCheck } from "react-icons/lu";
import { getDayStyle } from "./dayStyle";
import type { ShiftEntry } from "./index";

dayjs.locale("ja");

type SubmittedViewProps = {
  entries: ShiftEntry[];
  submittedAt: number | null;
  deadline: string;
  onEdit: () => void;
};

export const SubmittedView = ({ entries, submittedAt, deadline, onEdit }: SubmittedViewProps) => {
  const isBeforeDeadline = dayjs().isBefore(dayjs(`${deadline}T23:59:59`));

  return (
    <VStack gap={4} align="stretch">
      <Box bg="white" borderRadius="md" shadow="xs" p={4}>
        <VStack gap={3} align="center" mb={4}>
          <Center bg="green.100" p={3} borderRadius="full">
            <Icon as={LuCircleCheck} boxSize={6} color="green.600" />
          </Center>
          <Text fontWeight="bold" fontSize="md">
            シフト希望を提出しました
          </Text>
          <Text fontSize="sm" color="gray.600">
            提出内容は締切まで修正できます
          </Text>
          {submittedAt && (
            <Text fontSize="sm" color="gray.500">
              提出日時: {dayjs(submittedAt).format("M/D HH:mm")}
            </Text>
          )}
        </VStack>

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
      </Box>

      {isBeforeDeadline && (
        <VStack gap={1}>
          <Button variant="outline" colorPalette="teal" size="md" w="full" onClick={onEdit}>
            提出内容を修正する
          </Button>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            締切（{dayjs(deadline).format("M/D")}）まで修正可能
          </Text>
        </VStack>
      )}
    </VStack>
  );
};
