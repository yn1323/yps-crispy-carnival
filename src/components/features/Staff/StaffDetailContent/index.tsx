import { Badge, Box, Card, Flex, Heading, HStack, Icon, Progress, Text, VStack } from "@chakra-ui/react";
import { LuBriefcase, LuCalendar, LuClock, LuMail, LuStickyNote, LuWallet } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  maxWeeklyHours: number | undefined;
  memo: string;
  workStyleNote: string;
  hourlyWage: number | null;
  resignedAt: number | undefined;
  resignationReason: string | undefined;
  createdAt: number;
  isManager: boolean;
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

type StaffDetailContentProps = {
  staff: StaffType;
  positions: PositionType[];
  staffSkills: StaffSkillType[];
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

// スキルプログレスバーコンポーネント
type SkillProgressBarProps = {
  positions: PositionType[];
  staffSkills: StaffSkillType[];
};

const SkillProgressBar = ({ positions, staffSkills }: SkillProgressBarProps) => {
  // ポジションごとにスキルをマッピング
  const skillsToDisplay = positions.map((position) => {
    const skill = staffSkills.find((s) => s.positionId === position._id);
    return {
      positionName: position.name,
      level: skill?.level ?? "未経験",
    };
  });

  return (
    <VStack align="stretch" gap={3}>
      {skillsToDisplay.map((skill) => (
        <Box key={skill.positionName}>
          <Flex justify="space-between" align="center" mb={1}>
            <Text fontSize="sm" fontWeight="medium" color="gray.700">
              {skill.positionName}
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

export const StaffDetailContent = ({ staff, positions, staffSkills }: StaffDetailContentProps) => {
  // アバターのイニシャル生成
  const getInitials = (name: string) => {
    return name
      .split("")
      .slice(0, 2)
      .map((char) => char.toUpperCase())
      .join("");
  };

  // ステータスバッジの生成
  const statusBadge = () => {
    switch (staff.status) {
      case "active":
        return null;
      case "pending":
        return (
          <Badge colorPalette="orange" size="lg">
            招待中
          </Badge>
        );
      case "resigned":
        return (
          <Badge colorPalette="gray" size="lg">
            退職済み
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <VStack align="stretch" gap={4}>
      {/* ヘッダー（アバター + 名前 + バッジ） */}
      <Flex align="center" gap={4}>
        {/* アバター */}
        <Flex
          w={16}
          h={16}
          borderRadius="full"
          bgGradient="to-br"
          gradientFrom="teal.400"
          gradientTo="teal.600"
          align="center"
          justify="center"
          color="white"
          flexShrink={0}
        >
          <Text fontSize="2xl" fontWeight="bold">
            {getInitials(staff.displayName)}
          </Text>
        </Flex>

        <Box>
          <Flex align="center" gap={3} mb={2}>
            <Heading as="h3" size="lg" color="gray.900">
              {staff.displayName}
            </Heading>
            {statusBadge()}
            {staff.isManager && (
              <Badge colorPalette="purple" size="lg">
                マネージャー
              </Badge>
            )}
          </Flex>
          <Flex align="center" gap={2} fontSize="sm" color="gray.600">
            <Icon as={LuCalendar} boxSize={4} />
            <Text>登録日: {new Date(staff.createdAt).toLocaleDateString("ja-JP")}</Text>
          </Flex>
        </Box>
      </Flex>

      {/* 退職情報（退職済みの場合のみ表示） */}
      {staff.status === "resigned" && staff.resignedAt && (
        <Card.Root borderColor="gray.300">
          <Card.Header>
            <Heading as="h4" size="md" color="gray.600">
              退職情報
            </Heading>
          </Card.Header>
          <Card.Body pt={0}>
            <VStack align="stretch" gap={2}>
              <Text fontSize="sm" color="gray.500">
                退職日: {new Date(staff.resignedAt).toLocaleDateString("ja-JP")}
              </Text>
              {staff.resignationReason && (
                <Text fontSize="sm" color="gray.600">
                  理由: {staff.resignationReason}
                </Text>
              )}
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

      {/* 基本情報カード */}
      <Card.Root borderWidth={0} shadow="sm">
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
      <Card.Root borderWidth={0} shadow="sm">
        <Card.Header>
          <HStack>
            <Icon as={LuBriefcase} boxSize={5} color="gray.500" />
            <Text fontWeight="medium">スキル</Text>
          </HStack>
        </Card.Header>
        <Card.Body pt={0} mt={4}>
          <SkillProgressBar positions={positions} staffSkills={staffSkills} />
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
    </VStack>
  );
};

// 型をエクスポート
export type { StaffType, PositionType, StaffSkillType, StaffDetailContentProps };
