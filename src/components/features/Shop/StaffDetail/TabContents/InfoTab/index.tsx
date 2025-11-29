import { Badge, Box, Card, Flex, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { LuBriefcase, LuClock, LuMail, LuStickyNote, LuWallet } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";

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
  isOwner: boolean;
};

export const InfoTab = ({ staff, isOwner }: InfoTabProps) => {
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

            {/* スキル */}
            {staff.skills.length > 0 && (
              <Flex align="flex-start" gap={3}>
                <Icon as={LuBriefcase} boxSize={5} color="gray.500" mt={1} />
                <Text fontWeight="medium">スキル</Text>
                <Flex ml="auto" gap={2} flexWrap="wrap" justify="flex-end">
                  {staff.skills.map((skill, idx) => (
                    <Badge key={idx} colorPalette="teal" variant="subtle">
                      {skill.position}（{skill.level}）
                    </Badge>
                  ))}
                </Flex>
              </Flex>
            )}

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
            {isOwner && staff.hourlyWage && (
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

      {/* メモカード（オーナーのみ表示） */}
      {isOwner && (staff.memo || staff.workStyleNote) && (
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
