import { Box, Button, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useState } from "react";
import "dayjs/locale/ja";
import { Select } from "@/src/components/ui/Select";
import { getDayStyle } from "./dayStyle";
import type { ShiftEntry, TimePattern } from "./index";

dayjs.locale("ja");

type DayCardProps = {
  entry: ShiftEntry;
  frequentTimePatterns: TimePattern[];
  shop: { timeUnit: number; openTime: string; closeTime: string };
  onUpdate: (update: Partial<ShiftEntry>) => void;
};

// 店舗の営業時間とtimeUnitから時間選択肢を生成
const generateTimeOptions = (openTime: string, closeTime: string, timeUnit: number) => {
  const options: { value: string; label: string }[] = [];
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const startMinutes = openH * 60 + openM;
  const endMinutes = closeH * 60 + closeM;

  for (let m = startMinutes; m <= endMinutes; m += timeUnit) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    options.push({ value, label: value });
  }
  return options;
};

export const DayCard = ({ entry, frequentTimePatterns, shop, onUpdate }: DayCardProps) => {
  const [showCustomTime, setShowCustomTime] = useState(false);
  const d = dayjs(entry.date);
  const dayOfWeek = d.format("ddd");
  const dayStyle = getDayStyle(entry.date);

  const timeOptions = generateTimeOptions(shop.openTime, shop.closeTime, shop.timeUnit);

  // 現在選択中のパターンがチップと一致するか
  const selectedPatternKey = entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : null;

  const handleSelectAvailable = () => {
    onUpdate({ isAvailable: true });
  };

  const handleSelectUnavailable = () => {
    onUpdate({ isAvailable: false, startTime: undefined, endTime: undefined });
    setShowCustomTime(false);
  };

  const handleSelectPattern = (startTime: string, endTime: string) => {
    onUpdate({ isAvailable: true, startTime, endTime });
    setShowCustomTime(false);
  };

  if (!entry.isAvailable) {
    return (
      <Box
        bg="gray.100"
        borderRadius="md"
        p={3}
        border="1px solid"
        borderColor="gray.200"
        cursor="pointer"
        role="button"
        tabIndex={0}
        aria-label={`${d.format("M/D")}を出勤可能にする`}
        onClick={handleSelectAvailable}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelectAvailable();
          }
        }}
      >
        <VStack align="stretch" gap={2}>
          <HStack justify="space-between">
            <Text fontWeight="bold" fontSize="sm" color="gray.700">
              {d.format("M/D")} ({dayOfWeek})
            </Text>
            <Text fontSize="xs" color="gray.500">
              未選択（お休み）
            </Text>
          </HStack>
          <Text fontSize="sm" color="gray.600">
            タップして出勤可能にする
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg="white" borderRadius="md" shadow="xs" p={3} borderLeft="4px solid" borderLeftColor={dayStyle.borderColor}>
      <VStack gap={2} align="stretch">
        <HStack justify="space-between">
          <Text fontWeight="bold" fontSize="sm" color={dayStyle.textColor}>
            {d.format("M/D")} ({dayOfWeek})
          </Text>
          <Text fontSize="xs" color={dayStyle.textColor}>
            出勤可能
          </Text>
        </HStack>

        {frequentTimePatterns.length > 0 && (
          <VStack align="stretch" gap={1}>
            <Text fontSize="xs" color="gray.500">
              よく使う時間
            </Text>
            <Flex gap={2} flexWrap="wrap">
              {frequentTimePatterns.map((p) => {
                const key = `${p.startTime}-${p.endTime}`;
                const isSelected = selectedPatternKey === key;
                return (
                  <Button
                    key={key}
                    size="xs"
                    variant={isSelected ? "solid" : "outline"}
                    colorPalette={isSelected ? dayStyle.palette : "gray"}
                    onClick={() => handleSelectPattern(p.startTime, p.endTime)}
                  >
                    {p.startTime}-{p.endTime}
                  </Button>
                );
              })}
              <Button
                size="xs"
                variant={showCustomTime ? "subtle" : "outline"}
                colorPalette="gray"
                onClick={() => setShowCustomTime(!showCustomTime)}
              >
                時間を指定 {showCustomTime ? "▲" : "▼"}
              </Button>
            </Flex>
          </VStack>
        )}

        {entry.startTime && entry.endTime && !showCustomTime && (
          <Text fontSize="sm" color={dayStyle.textColor} fontWeight="medium">
            選択中: {entry.startTime}〜{entry.endTime}
          </Text>
        )}

        {(showCustomTime || frequentTimePatterns.length === 0) && (
          <HStack gap={2} align="center">
            <Select
              items={timeOptions}
              value={entry.startTime ?? ""}
              onChange={(v) => onUpdate({ startTime: v })}
              placeholder="開始"
              size="sm"
            />
            <Text fontSize="sm" color="gray.500">
              〜
            </Text>
            <Select
              items={timeOptions}
              value={entry.endTime ?? ""}
              onChange={(v) => onUpdate({ endTime: v })}
              placeholder="終了"
              size="sm"
            />
          </HStack>
        )}

        <Button variant="ghost" size="xs" colorPalette="gray" alignSelf="flex-end" onClick={handleSelectUnavailable}>
          この日の入力を取り消す
        </Button>
      </VStack>
    </Box>
  );
};
