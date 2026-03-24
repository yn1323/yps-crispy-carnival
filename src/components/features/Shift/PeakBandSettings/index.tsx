import { Box, Button, Container, Flex, Heading, Icon, IconButton, Input, Text, VStack } from "@chakra-ui/react";
import { useCallback, useState } from "react";
import { LuPlus, LuSave, LuSettings, LuTrash2 } from "react-icons/lu";
import { Title } from "@/src/components/ui/Title";
import { DayTabs } from "../StaffingRequirement/DayTabs";

type PeakBand = {
  name: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
};

type DaySettings = {
  peakBands: PeakBand[];
  minimumStaff: number;
};

type PeakBandSettingsProps = {
  shopId: string;
  shopName: string;
  onSave: (params: { dayOfWeek: number; peakBands: PeakBand[]; minimumStaff: number }) => Promise<void>;
  isSaving?: boolean;
};

const DEFAULT_PEAK_BAND: PeakBand = { name: "", startTime: "11:00", endTime: "14:00", requiredCount: 3 };
const DEFAULT_DAY_SETTINGS: DaySettings = { peakBands: [], minimumStaff: 1 };

export const PeakBandSettings = ({ shopId, shopName, onSave, isSaving = false }: PeakBandSettingsProps) => {
  const [selectedDay, setSelectedDay] = useState(1);
  const [daySettingsMap, setDaySettingsMap] = useState<Record<number, DaySettings>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const currentSettings = daySettingsMap[selectedDay] ?? DEFAULT_DAY_SETTINGS;

  const updateCurrentDay = useCallback(
    (updater: (prev: DaySettings) => DaySettings) => {
      setDaySettingsMap((prev) => ({
        ...prev,
        [selectedDay]: updater(prev[selectedDay] ?? DEFAULT_DAY_SETTINGS),
      }));
      setHasChanges(true);
    },
    [selectedDay],
  );

  // ピーク帯追加
  const handleAddBand = useCallback(() => {
    updateCurrentDay((prev) => ({
      ...prev,
      peakBands: [...prev.peakBands, { ...DEFAULT_PEAK_BAND }],
    }));
  }, [updateCurrentDay]);

  // ピーク帯削除
  const handleRemoveBand = useCallback(
    (index: number) => {
      updateCurrentDay((prev) => ({
        ...prev,
        peakBands: prev.peakBands.filter((_, i) => i !== index),
      }));
    },
    [updateCurrentDay],
  );

  // ピーク帯フィールド更新
  const handleBandChange = useCallback(
    (index: number, field: keyof PeakBand, value: string | number) => {
      updateCurrentDay((prev) => ({
        ...prev,
        peakBands: prev.peakBands.map((band, i) => (i === index ? { ...band, [field]: value } : band)),
      }));
    },
    [updateCurrentDay],
  );

  // 最低人員更新
  const handleMinimumStaffChange = useCallback(
    (value: number) => {
      updateCurrentDay((prev) => ({ ...prev, minimumStaff: value }));
    },
    [updateCurrentDay],
  );

  // 保存
  const handleSave = useCallback(async () => {
    try {
      await onSave({
        dayOfWeek: selectedDay,
        peakBands: currentSettings.peakBands,
        minimumStaff: currentSettings.minimumStaff,
      });
      setHasChanges(false);
    } catch {
      // エラーは親でハンドリング
    }
  }, [selectedDay, currentSettings, onSave]);

  // 設定済み曜日の一覧
  const configuredDays = Object.keys(daySettingsMap)
    .map(Number)
    .filter((day) => {
      const settings = daySettingsMap[day];
      return settings && settings.peakBands.length > 0;
    });

  return (
    <Container maxW="4xl">
      {/* ヘッダー */}
      <Title prev={{ url: `/shops/${shopId}/shifts`, label: "シフト管理に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="purple.50" borderRadius="lg">
            <Icon as={LuSettings} boxSize={6} color="purple.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              必要人員設定
            </Heading>
            <Text color="gray.500" fontSize="sm">
              {shopName}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* 曜日タブ */}
      <Box mb={6}>
        <DayTabs selectedDay={selectedDay} onChange={setSelectedDay} configuredDays={configuredDays} />
      </Box>

      {/* ピーク帯設定 */}
      <VStack align="stretch" gap={6}>
        {/* ピーク帯リスト */}
        <Box>
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontWeight="bold" fontSize="md">
              ピーク帯
            </Text>
            <Button size="sm" variant="outline" colorPalette="teal" onClick={handleAddBand}>
              <Icon as={LuPlus} />
              追加
            </Button>
          </Flex>

          {currentSettings.peakBands.length === 0 ? (
            <Box bg="gray.50" borderRadius="md" p={6} textAlign="center">
              <Text color="gray.500" fontSize="sm">
                ピーク帯が設定されていません
              </Text>
              <Text color="gray.400" fontSize="xs" mt={1}>
                「追加」ボタンからランチ帯・ディナー帯などを設定してください
              </Text>
            </Box>
          ) : (
            <VStack gap={3}>
              {currentSettings.peakBands.map((band, index) => (
                <Flex
                  key={`band-${index}`}
                  gap={3}
                  align="center"
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  p={3}
                  flexWrap={{ base: "wrap", md: "nowrap" }}
                >
                  <Input
                    size="sm"
                    placeholder="名前（例: ランチ）"
                    value={band.name}
                    onChange={(e) => handleBandChange(index, "name", e.target.value)}
                    w={{ base: "100%", md: "140px" }}
                  />
                  <Flex gap={1} align="center" flexShrink={0}>
                    <Input
                      size="sm"
                      type="time"
                      value={band.startTime}
                      onChange={(e) => handleBandChange(index, "startTime", e.target.value)}
                      w="120px"
                    />
                    <Text color="gray.400" fontSize="sm">
                      〜
                    </Text>
                    <Input
                      size="sm"
                      type="time"
                      value={band.endTime}
                      onChange={(e) => handleBandChange(index, "endTime", e.target.value)}
                      w="120px"
                    />
                  </Flex>
                  <Flex gap={1} align="center" flexShrink={0}>
                    <Input
                      size="sm"
                      type="number"
                      min={1}
                      value={band.requiredCount}
                      onChange={(e) => handleBandChange(index, "requiredCount", Number(e.target.value))}
                      w="70px"
                      textAlign="center"
                    />
                    <Text color="gray.500" fontSize="sm" whiteSpace="nowrap">
                      人
                    </Text>
                  </Flex>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    aria-label="削除"
                    onClick={() => handleRemoveBand(index)}
                  >
                    <Icon as={LuTrash2} />
                  </IconButton>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>

        {/* 最低人員 */}
        <Box>
          <Text fontWeight="bold" fontSize="md" mb={3}>
            最低人員
          </Text>
          <Flex align="center" gap={2} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
            <Text color="gray.600" fontSize="sm">
              常に最低
            </Text>
            <Input
              size="sm"
              type="number"
              min={0}
              value={currentSettings.minimumStaff}
              onChange={(e) => handleMinimumStaffChange(Number(e.target.value))}
              w="70px"
              textAlign="center"
            />
            <Text color="gray.600" fontSize="sm">
              人を配置
            </Text>
          </Flex>
        </Box>

        {/* 保存バー */}
        <Flex
          position="sticky"
          bottom={0}
          zIndex={10}
          bg="white"
          borderTop="1px solid"
          borderColor="gray.200"
          py={3}
          justify="flex-end"
          align="center"
          gap={3}
        >
          {hasChanges && (
            <Text fontSize="sm" color="orange.600" fontWeight="medium">
              未保存の変更があります
            </Text>
          )}
          <Button colorPalette="teal" onClick={handleSave} disabled={!hasChanges} loading={isSaving}>
            <Icon as={LuSave} />
            保存する
          </Button>
        </Flex>
      </VStack>
    </Container>
  );
};
