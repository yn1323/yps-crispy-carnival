import { Box, Button, Icon, Text, VStack } from "@chakra-ui/react";
import { LuHistory } from "react-icons/lu";
import { DayCard } from "./DayCard";
import type { ShiftEntry, TimePattern } from "./index";

type EntryFormProps = {
  entries: ShiftEntry[];
  totalDays: number;
  previousRequest: {
    entries: { date: string; isAvailable: boolean; startTime?: string; endTime?: string }[];
  } | null;
  frequentTimePatterns: TimePattern[];
  shop: { timeUnit: number; openTime: string; closeTime: string };
  onUpdateEntry: (date: string, update: Partial<ShiftEntry>) => void;
  onApplyPrevious: () => void;
  onConfirm: () => void;
};

export const EntryForm = ({
  entries,
  totalDays,
  previousRequest,
  frequentTimePatterns,
  shop,
  onUpdateEntry,
  onApplyPrevious,
  onConfirm,
}: EntryFormProps) => {
  const availableCount = entries.filter((e) => e.isAvailable).length;
  // 出勤可能なのに時間未設定のエントリーがないかチェック
  const hasIncompleteAvailable = entries.some((e) => e.isAvailable && (!e.startTime || !e.endTime));

  return (
    <VStack gap={4} align="stretch">
      {/* 前回と同じボタン */}
      {previousRequest && (
        <VStack gap={1} align="stretch">
          <Button variant="outline" colorPalette="teal" onClick={onApplyPrevious} w="full">
            <Icon as={LuHistory} mr={2} />
            前回の提出内容を反映する
          </Button>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            曜日ごとに前回の時間帯を反映します
          </Text>
        </VStack>
      )}

      {/* ガイドテキスト */}
      <VStack gap={1}>
        <Text fontSize="sm" color="gray.700" textAlign="center" fontWeight="medium">
          出勤できる日だけ選んでください
        </Text>
        <Text fontSize="xs" color="gray.500" textAlign="center">
          選ばない日は「お休み」として扱われます
        </Text>
      </VStack>

      {/* 日ごとのカード */}
      {entries.map((entry) => (
        <DayCard
          key={entry.date}
          entry={entry}
          frequentTimePatterns={frequentTimePatterns}
          shop={shop}
          onUpdate={(update) => onUpdateEntry(entry.date, update)}
        />
      ))}

      {/* 出勤可能日数 + 確認ボタン */}
      <Box pt={2}>
        <Text fontSize="sm" color="gray.600" textAlign="center" mb={2}>
          出勤可能: {availableCount}日 / {totalDays}日中
        </Text>
        {hasIncompleteAvailable && (
          <Text fontSize="sm" color="red.500" textAlign="center" mb={2}>
            出勤可能にした日は、開始時刻と終了時刻を入力してください
          </Text>
        )}
        <Button colorPalette="teal" size="lg" w="full" disabled={hasIncompleteAvailable} onClick={onConfirm}>
          入力内容を確認する
        </Button>
      </Box>
    </VStack>
  );
};
