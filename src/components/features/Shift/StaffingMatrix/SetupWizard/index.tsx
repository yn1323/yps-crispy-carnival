import { Box, Button, Container, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { LuArrowLeft, LuPlus, LuSave } from "react-icons/lu";
import { AIGenerateForm } from "../AIGenerateForm";
import { DaySelector } from "../DaySelector";
import { StaffingTable } from "../StaffingTable";

type PositionType = {
  _id: string;
  name: string;
};

type StaffingEntry = {
  hour: number;
  position: string;
  requiredCount: number;
};

type AIInput = {
  shopType: string;
  customerCount: string;
};

type PatternType = {
  id: string;
  staffing: StaffingEntry[];
  appliedDays: number[];
};

type SetupWizardProps = {
  openTime: string;
  closeTime: string;
  positions: PositionType[];
  onSave: (patterns: PatternType[], aiInput?: AIInput) => void;
  onCancel: () => void;
};

export const SetupWizard = ({ openTime, closeTime, positions, onSave, onCancel }: SetupWizardProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [aiInput, setAIInput] = useState<AIInput | undefined>();
  const [patterns, setPatterns] = useState<PatternType[]>([]);
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // AI生成完了時
  const handleGenerate = (staffing: StaffingEntry[], input: AIInput) => {
    setIsGenerating(true);

    // 少し遅延を入れて生成感を出す
    setTimeout(() => {
      setAIInput(input);
      setPatterns([
        {
          id: crypto.randomUUID(),
          staffing,
          appliedDays: [1, 2, 3, 4, 5], // デフォルトで平日
        },
      ]);
      setCurrentPatternIndex(0);
      setStep(2);
      setIsGenerating(false);
    }, 500);
  };

  // スキップ時（手動入力）
  const handleSkip = () => {
    setPatterns([
      {
        id: crypto.randomUUID(),
        staffing: [],
        appliedDays: [1, 2, 3, 4, 5],
      },
    ]);
    setCurrentPatternIndex(0);
    setStep(2);
  };

  // パターンのstaffing更新
  const handleStaffingChange = (staffing: StaffingEntry[]) => {
    setPatterns((prev) => prev.map((p, i) => (i === currentPatternIndex ? { ...p, staffing } : p)));
  };

  // パターンの適用曜日更新
  const handleDaysChange = (days: number[]) => {
    setPatterns((prev) => prev.map((p, i) => (i === currentPatternIndex ? { ...p, appliedDays: days } : p)));
  };

  // 別パターン追加
  const handleAddPattern = () => {
    // 現在のパターンをコピー
    const currentPattern = patterns[currentPatternIndex];
    const usedDays = patterns.flatMap((p) => p.appliedDays);
    const availableDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !usedDays.includes(d));

    const newPattern: PatternType = {
      id: crypto.randomUUID(),
      staffing: [...currentPattern.staffing],
      appliedDays: availableDays.length > 0 ? [availableDays[0]] : [],
    };

    setPatterns((prev) => [...prev, newPattern]);
    setCurrentPatternIndex(patterns.length);
  };

  // 保存
  const handleSave = () => {
    onSave(patterns, aiInput);
  };

  // 戻る
  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else {
      onCancel();
    }
  };

  // 使用済み曜日（現在のパターン以外）
  const usedDaysExceptCurrent = patterns.filter((_, i) => i !== currentPatternIndex).flatMap((p) => p.appliedDays);

  // 全曜日が設定済みかどうか
  const allDaysAssigned = patterns.flatMap((p) => p.appliedDays).length === 7;

  // 保存可能かどうか
  const canSave = patterns.every((p) => p.appliedDays.length > 0 && p.staffing.length > 0);

  return (
    <Container maxW="4xl">
      {/* ステップインジケーター */}
      <Flex align="center" gap={2} mb={6}>
        <Text fontSize="sm" color={step === 1 ? "teal.600" : "gray.400"} fontWeight={step === 1 ? "bold" : "normal"}>
          Step 1: AI生成
        </Text>
        <Text color="gray.300">→</Text>
        <Text fontSize="sm" color={step === 2 ? "teal.600" : "gray.400"} fontWeight={step === 2 ? "bold" : "normal"}>
          Step 2: 調整・保存
        </Text>
      </Flex>

      {/* Step 1: AI生成フォーム */}
      {step === 1 && (
        <AIGenerateForm
          openTime={openTime}
          closeTime={closeTime}
          positions={positions}
          initialAIInput={aiInput}
          onGenerate={handleGenerate}
          onSkip={handleSkip}
          isLoading={isGenerating}
        />
      )}

      {/* Step 2: 編集・曜日選択 */}
      {step === 2 && (
        <VStack gap={6} align="stretch">
          {/* パターンタブ（複数パターンがある場合） */}
          {patterns.length > 1 && (
            <Flex gap={2} wrap="wrap">
              {patterns.map((pattern, index) => (
                <Button
                  key={pattern.id}
                  size="sm"
                  variant={index === currentPatternIndex ? "solid" : "outline"}
                  colorPalette={index === currentPatternIndex ? "teal" : "gray"}
                  onClick={() => setCurrentPatternIndex(index)}
                >
                  パターン {index + 1}
                </Button>
              ))}
            </Flex>
          )}

          {/* 説明テキスト */}
          <Text color="gray.600">
            {aiInput ? "AIの提案結果を確認・調整してください" : "必要な人員を入力してください"}
          </Text>

          {/* 編集テーブル */}
          <Box>
            <StaffingTable
              openTime={openTime}
              closeTime={closeTime}
              positions={positions}
              staffing={patterns[currentPatternIndex]?.staffing ?? []}
              onChange={handleStaffingChange}
            />
          </Box>

          {/* 曜日選択 */}
          <Box borderTop="1px solid" borderColor="gray.200" pt={4}>
            <DaySelector
              selectedDays={patterns[currentPatternIndex]?.appliedDays ?? []}
              onChange={handleDaysChange}
              disabledDays={usedDaysExceptCurrent}
              label="この設定を適用する曜日"
            />
          </Box>

          {/* アクションボタン */}
          <Flex gap={3} justify="space-between" borderTop="1px solid" borderColor="gray.200" pt={4}>
            <Button variant="ghost" onClick={handleBack}>
              <Icon as={LuArrowLeft} />
              戻る
            </Button>

            <Flex gap={3}>
              {!allDaysAssigned && (
                <Button variant="outline" onClick={handleAddPattern}>
                  <Icon as={LuPlus} />
                  別パターンを追加
                </Button>
              )}
              <Button colorPalette="teal" onClick={handleSave} disabled={!canSave}>
                <Icon as={LuSave} />
                保存する
              </Button>
            </Flex>
          </Flex>
        </VStack>
      )}
    </Container>
  );
};
