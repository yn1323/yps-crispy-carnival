import { Badge, Box, Card, Flex, HStack, Icon, Progress, Text, VStack } from "@chakra-ui/react";
import { LuBriefcase, LuClock, LuMail, LuStickyNote, LuWallet } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";
import { DEFAULT_POSITIONS } from "@/src/constants/validations";

type StaffType = {
  email: string;
  skills: { position: string; level: string }[];
  maxWeeklyHours: number | undefined;
  memo: string;
  workStyleNote: string;
  hourlyWage: number | null;
};

type InfoTabProps = {
  staff: StaffType;
};

// スキルレベルに応じた進捗値を取得
const getProgressValue = (level: string): number => {
  switch (level) {
    case "未経験":
      return 0;
    case "研修中":
      return 33;
    case "一人前":
      return 66;
    case "ベテラン":
      return 100;
    default:
      return 0;
  }
};

// スキルレベルに応じたバー色を取得
const getBarColor = (level: string): string => {
  switch (level) {
    case "未経験":
      return "gray.300";
    case "研修中":
      return "teal.300";
    case "一人前":
      return "teal.500";
    case "ベテラン":
      return "teal.600";
    default:
      return "gray.300";
  }
};

// スキルレベルに応じたBadge色を取得
const getBadgeColor = (level: string): string => {
  return level === "未経験" ? "gray" : "teal";
};

// スキル配列を全ポジション分に正規化（未登録ポジションは「未経験」で補完）
const normalizeSkills = (skills: { position: string; level: string }[]) => {
  return DEFAULT_POSITIONS.map((position) => {
    const existingSkill = skills.find((s) => s.position === position);
    return existingSkill || { position, level: "未経験" };
  });
};

// スキルプログレスバーコンポーネント
type SkillProgressBarProps = {
  skills: { position: string; level: string }[];
};

const SkillProgressBar = ({ skills }: SkillProgressBarProps) => {
  const normalizedSkills = normalizeSkills(skills);

  return (
    <VStack align="stretch" gap={3}>
      {normalizedSkills.map((skill) => (
        <Box key={skill.position}>
          <Flex justify="space-between" align="center" mb={1}>
            <Text fontSize="sm" fontWeight="medium" color="gray.700">
              {skill.position}
            </Text>
            <Badge colorPalette={getBadgeColor(skill.level)} size="sm">
              {skill.level}
            </Badge>
          </Flex>
          <Progress.Root value={getProgressValue(skill.level)} size="sm">
            <Progress.Track bg="gray.100">
              <Progress.Range bg={getBarColor(skill.level)} transition="width 0.5s ease-out" />
            </Progress.Track>
          </Progress.Root>
        </Box>
      ))}
    </VStack>
  );
};

export const InfoTab = ({ staff }: InfoTabProps) => {
  return (
    <Animation>
      {/* 基本情報カード */}
      <Card.Root borderWidth={0} shadow="sm" mb={{ base: 4, md: 6 }}>
        <Card.Body>
          <VStack align="stretch" gap={4}>
            {/* メールアドレス */}
            <Flex align="center" gap={3}>
              <Icon as={LuMail} boxSize={5} color="gray.500" />
              <Text fontWeight="medium">メールアドレス</Text>
              <Text ml="auto" color="gray.600">
                {staff.email}
              </Text>
            </Flex>

            {/* 週最大勤務時間 */}
            {staff.maxWeeklyHours && (
              <Flex align="center" gap={3}>
                <Icon as={LuClock} boxSize={5} color="gray.500" />
                <Text fontWeight="medium">週最大勤務時間</Text>
                <Text ml="auto" color="gray.600">
                  {staff.maxWeeklyHours}時間
                </Text>
              </Flex>
            )}

            {/* 時給（オーナーのみ表示） */}
            {staff.hourlyWage && (
              <Flex align="center" gap={3}>
                <Icon as={LuWallet} boxSize={5} color="gray.500" />
                <Text fontWeight="medium">時給</Text>
                <Text ml="auto" color="gray.600">
                  ¥{staff.hourlyWage.toLocaleString()}
                </Text>
              </Flex>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* スキルカード */}
      <Card.Root borderWidth={0} shadow="sm" mb={{ base: 4, md: 6 }}>
        <Card.Header>
          <HStack>
            <Icon as={LuBriefcase} boxSize={5} color="gray.500" />
            <Text fontWeight="medium">スキル</Text>
          </HStack>
        </Card.Header>
        <Card.Body pt={0}>
          <SkillProgressBar skills={staff.skills} />
        </Card.Body>
      </Card.Root>

      {/* メモカード（オーナーのみ表示） */}
      {(staff.memo || staff.workStyleNote) && (
        <Card.Root borderWidth={0} shadow="sm">
          <Card.Header>
            <HStack>
              <Icon as={LuStickyNote} boxSize={5} color="gray.500" />
              <Text fontWeight="medium">メモ</Text>
            </HStack>
          </Card.Header>
          <Card.Body pt={0}>
            <VStack align="stretch" gap={4}>
              {staff.memo && (
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>
                    スタッフメモ
                  </Text>
                  <Text whiteSpace="pre-wrap">{staff.memo}</Text>
                </Box>
              )}
              {staff.workStyleNote && (
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>
                    勤務スタイルメモ
                  </Text>
                  <Text whiteSpace="pre-wrap">{staff.workStyleNote}</Text>
                </Box>
              )}
            </VStack>
          </Card.Body>
        </Card.Root>
      )}
    </Animation>
  );
};
