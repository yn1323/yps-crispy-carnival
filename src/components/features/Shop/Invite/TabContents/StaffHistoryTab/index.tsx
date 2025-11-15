import { Badge, Box, Card, Flex, Icon, Stack, Tabs, Text } from "@chakra-ui/react";
import { LuMail, LuUsers } from "react-icons/lu";

type StaffHistoryTabProps = {
  shopId: string;
};

// モックデータ
const mockInvitationHistory = [
  {
    id: 1,
    name: "佐藤花子",
    email: "sato@example.com",
    status: "参加済み" as const,
    invitedAt: "11/1",
    joinedAt: "11/3",
    invitedBy: "山田太郎",
  },
  {
    id: 2,
    name: "鈴木一郎",
    email: "suzuki@example.com",
    status: "参加済み" as const,
    invitedAt: "10/20",
    joinedAt: "10/22",
    invitedBy: "山田太郎",
  },
  {
    id: 3,
    email: "tanaka@example.com",
    status: "招待中" as const,
    invitedAt: "11/1",
    invitedBy: "佐藤花子",
  },
  {
    id: 4,
    email: "ito@example.com",
    status: "招待中" as const,
    invitedAt: "11/4",
    invitedBy: "山田太郎",
  },
];

export const StaffHistoryTab = (_props: StaffHistoryTabProps) => {
  const joinedStaff = mockInvitationHistory.filter((h) => h.status === "参加済み");
  const pendingInvites = mockInvitationHistory.filter((h) => h.status === "招待中");

  return (
    <Tabs.Root defaultValue="joined" w="full" variant="enclosed">
      <Tabs.List mb={4}>
        <Tabs.Trigger value="joined" gap={2}>
          <Icon as={LuUsers} boxSize={4} />
          参加済み
          <Badge ml={1}>{joinedStaff.length}</Badge>
        </Tabs.Trigger>
        <Tabs.Trigger value="pending" gap={2}>
          <Icon as={LuMail} boxSize={4} />
          招待中
          <Badge ml={1}>{pendingInvites.length}</Badge>
        </Tabs.Trigger>
      </Tabs.List>

      {/* 参加済みタブ */}
      <Tabs.Content value="joined">
        {joinedStaff.length > 0 ? (
          <Stack gap={3}>
            {joinedStaff.map((staff) => (
              <Box key={staff.id}>
                <Card.Root variant="elevated">
                  <Card.Body p={4}>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Flex align="center" gap={3} flex={1} minW={0}>
                        <Flex
                          w={10}
                          h={10}
                          borderRadius="full"
                          bgGradient="to-br"
                          gradientFrom="teal.400"
                          gradientTo="teal.600"
                          align="center"
                          justify="center"
                          color="white"
                          flexShrink={0}
                        >
                          <Icon as={LuUsers} boxSize={5} />
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" color="gray.900" mb={1}>
                            {staff.name}
                          </Text>
                          <Flex align="center" gap={2} fontSize="xs" color="gray.600">
                            <Text>{staff.invitedAt}招待</Text>
                            <Text>→</Text>
                            <Text>{staff.joinedAt}参加</Text>
                          </Flex>
                        </Box>
                      </Flex>
                      <Badge colorPalette="teal" variant="solid" fontSize="xs" flexShrink={0}>
                        参加済み
                      </Badge>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Box>
            ))}
          </Stack>
        ) : (
          <Card.Root variant="elevated">
            <Card.Body p={8} textAlign="center">
              <Icon as={LuUsers} boxSize={12} color="gray.300" mx="auto" mb={3} />
              <Text fontSize="sm" color="gray.500">
                参加済みのスタッフはいません
              </Text>
            </Card.Body>
          </Card.Root>
        )}
      </Tabs.Content>

      {/* 招待中タブ */}
      <Tabs.Content value="pending">
        {pendingInvites.length > 0 ? (
          <Stack gap={3}>
            {pendingInvites.map((invite) => (
              <Box key={invite.id}>
                <Card.Root variant="elevated">
                  <Card.Body p={4}>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Flex align="center" gap={3} flex={1} minW={0}>
                        <Flex
                          w={10}
                          h={10}
                          borderRadius="full"
                          bgGradient="to-br"
                          gradientFrom="orange.400"
                          gradientTo="orange.600"
                          align="center"
                          justify="center"
                          color="white"
                          flexShrink={0}
                        >
                          <Icon as={LuMail} boxSize={5} />
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" color="gray.900" mb={1} truncate>
                            {invite.email}
                          </Text>
                          <Text fontSize="xs" color="gray.600">
                            {invite.invitedAt}送信
                          </Text>
                        </Box>
                      </Flex>
                      <Badge colorPalette="orange" variant="solid" fontSize="xs" flexShrink={0}>
                        招待中
                      </Badge>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Box>
            ))}
          </Stack>
        ) : (
          <Card.Root variant="elevated">
            <Card.Body p={8} textAlign="center">
              <Icon as={LuMail} boxSize={12} color="gray.300" mx="auto" mb={3} />
              <Text fontSize="sm" color="gray.500">
                招待中のスタッフはいません
              </Text>
            </Card.Body>
          </Card.Root>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
};
