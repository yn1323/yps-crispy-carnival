import { Box, Button, Card, Field, Flex, Icon, Input, SimpleGrid, Text, Textarea, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { LuCheck, LuSave } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { SKILL_LEVELS, type SkillLevelType } from "@/src/constants/validations";
import { type SkillsFormValues, type StaffEditFormValues, staffEditSchema } from "./schema";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  memo: string;
  workStyleNote: string;
  resignedAt: number | undefined;
  resignationReason: string | undefined;
  createdAt: number;
};

type PositionType = {
  _id: Id<"shopPositions">;
  name: string;
  order: number;
};

type StaffSkillType = {
  _id: Id<"staffSkills">;
  positionId: Id<"shopPositions">;
  positionName: string;
  positionOrder: number;
  level: string;
};

// 配列形式のスキルをオブジェクト形式に変換（フォーム用）
const convertSkillsArrayToObject = (positions: PositionType[], staffSkills: StaffSkillType[]): SkillsFormValues => {
  const result: SkillsFormValues = {};

  // まず全ポジションを「未経験」で初期化
  for (const position of positions) {
    result[position._id] = SKILL_LEVELS[0]; // "未経験"
  }

  // 既存のスキルデータで上書き
  for (const skill of staffSkills) {
    if (SKILL_LEVELS.includes(skill.level as SkillLevelType)) {
      result[skill.positionId] = skill.level as SkillLevelType;
    }
  }

  return result;
};

// スキルレベル選択ボタン
type SkillLevelButtonProps = {
  level: SkillLevelType;
  isSelected: boolean;
  onClick: () => void;
};

const SkillLevelButton = ({ level, isSelected, onClick }: SkillLevelButtonProps) => {
  return (
    <Button
      type="button"
      size="sm"
      variant={isSelected ? "solid" : "outline"}
      colorPalette={isSelected ? "teal" : "gray"}
      bg={isSelected ? "teal.50" : "gray.100"}
      color={isSelected ? "teal.700" : "gray.600"}
      borderWidth={isSelected ? "2px" : "1px"}
      borderColor={isSelected ? "teal.500" : "transparent"}
      _hover={{
        bg: isSelected ? "teal.100" : "gray.200",
        transform: "scale(1.02)",
      }}
      transition="all 0.15s ease"
      onClick={onClick}
      h={{ base: "44px", md: "40px" }}
      minW={0}
      px={2}
      gap={1}
    >
      {isSelected && <Icon as={LuCheck} boxSize={3} />}
      <Text fontSize={{ base: "xs", md: "sm" }}>{level}</Text>
    </Button>
  );
};

// スキルマトリックス（ポジションごとのレベル選択）
type SkillMatrixProps = {
  positions: PositionType[];
  value: SkillsFormValues;
  onChange: (value: SkillsFormValues) => void;
};

const SkillMatrix = ({ positions, value, onChange }: SkillMatrixProps) => {
  const handleLevelChange = (positionId: string, level: SkillLevelType) => {
    onChange({
      ...value,
      [positionId]: level,
    });
  };

  return (
    <VStack align="stretch" gap={4}>
      {positions.map((position) => (
        <Box key={position._id}>
          <Text fontWeight="medium" color="gray.700" mb={2} fontSize="sm">
            {position.name}
          </Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={2}>
            {SKILL_LEVELS.map((level) => (
              <SkillLevelButton
                key={level}
                level={level}
                isSelected={value[position._id] === level}
                onClick={() => handleLevelChange(position._id, level)}
              />
            ))}
          </SimpleGrid>
        </Box>
      ))}
    </VStack>
  );
};

export type StaffEditFormProps = {
  staff: StaffType;
  positions: PositionType[];
  staffSkills: StaffSkillType[];
  onSubmit: (data: StaffEditFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
};

export const StaffEditForm = ({
  staff,
  positions,
  staffSkills,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = "保存",
  cancelLabel = "キャンセル",
}: StaffEditFormProps) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<StaffEditFormValues>({
    resolver: zodResolver(staffEditSchema),
    defaultValues: {
      email: staff.email,
      displayName: staff.displayName,
      skills: convertSkillsArrayToObject(positions, staffSkills),
      memo: staff.memo ?? "",
      workStyleNote: staff.workStyleNote ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <VStack align="stretch" gap={6}>
        {/* 基本情報カード */}
        <Card.Root>
          <Card.Header>
            <Text fontWeight="bold" fontSize="md">
              基本情報
            </Text>
          </Card.Header>
          <Card.Body pt={0}>
            <VStack align="stretch" gap={4}>
              {/* メールアドレス */}
              <Field.Root invalid={!!errors.email} required>
                <Field.Label>メールアドレス</Field.Label>
                <Input {...register("email")} type="email" placeholder="example@example.com" />
                <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
              </Field.Root>

              {/* 表示名 */}
              <Field.Root invalid={!!errors.displayName} required>
                <Field.Label>表示名</Field.Label>
                <Input {...register("displayName")} placeholder="表示名を入力" />
                <Field.ErrorText>{errors.displayName?.message}</Field.ErrorText>
              </Field.Root>
            </VStack>
          </Card.Body>
        </Card.Root>

        {/* スキルカード */}
        <Card.Root>
          <Card.Header>
            <Text fontWeight="bold" fontSize="md">
              スキル
            </Text>
          </Card.Header>
          <Card.Body pt={0}>
            <Controller
              control={control}
              name="skills"
              render={({ field }) => (
                <SkillMatrix positions={positions} value={field.value} onChange={field.onChange} />
              )}
            />
          </Card.Body>
        </Card.Root>

        {/* メモカード */}
        <Card.Root>
          <Card.Header>
            <Text fontWeight="bold" fontSize="md">
              メモ
            </Text>
          </Card.Header>
          <Card.Body pt={0}>
            <VStack align="stretch" gap={4}>
              {/* スタッフメモ */}
              <Field.Root invalid={!!errors.memo}>
                <Field.Label>スタッフメモ</Field.Label>
                <Textarea {...register("memo")} placeholder="スタッフに関するメモを入力" rows={3} />
                <Field.ErrorText>{errors.memo?.message}</Field.ErrorText>
              </Field.Root>

              {/* 勤務スタイルメモ */}
              <Field.Root invalid={!!errors.workStyleNote}>
                <Field.Label>勤務スタイルメモ</Field.Label>
                <Textarea
                  {...register("workStyleNote")}
                  placeholder="勤務スタイルに関するメモを入力（例: 土日のみ勤務可能）"
                  rows={3}
                />
                <Field.ErrorText>{errors.workStyleNote?.message}</Field.ErrorText>
              </Field.Root>
            </VStack>
          </Card.Body>
        </Card.Root>

        {/* 送信ボタン */}
        <Flex justify="flex-end" gap={3}>
          <Button type="button" variant="outline" colorPalette="gray" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" colorPalette="teal" loading={isSubmitting} gap={2}>
            <Icon as={LuSave} boxSize={4} />
            {submitLabel}
          </Button>
        </Flex>
      </VStack>
    </form>
  );
};

// 型のre-export
export type { StaffType, PositionType, StaffSkillType };
export { convertSkillsArrayToObject };
