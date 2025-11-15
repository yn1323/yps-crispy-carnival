import { Badge, Box, Button, Card, Flex, Heading, Icon, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuCheck, LuClock, LuCopy, LuLink2, LuTrash2 } from "react-icons/lu";

type ManageTabProps = {
  shopId: string;
};

// モックデータ
const mockInviteUrls = [
  {
    id: 1,
    url: "https://shift.app/invite/abc123xyz",
    status: "未使用" as const,
    createdAt: "11/1",
    createdBy: "山田太郎",
    expiresInDays: 23,
  },
  {
    id: 2,
    url: "https://shift.app/invite/def456uvw",
    status: "未使用" as const,
    createdAt: "11/5",
    createdBy: "佐藤花子",
    expiresInDays: 27,
  },
  {
    id: 3,
    url: "https://shift.app/invite/ghi789rst",
    status: "使用済み" as const,
    createdAt: "10/25",
    createdBy: "山田太郎",
    usedAt: "10/26",
  },
];

export const ManageTab = ({ shopId }: ManageTabProps) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopyUrl = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteUrl = (id: number) => {
    // TODO: 実際の削除処理
    console.log("招待URL削除:", id, "shopId:", shopId);
  };

  const activeUrls = mockInviteUrls.filter((u) => u.status === "未使用");
  const usedUrls = mockInviteUrls.filter((u) => u.status === "使用済み");

  return (
    <Stack gap={6}>
      {/* 未使用URL */}
      <Box>
        <Flex align="center" justify="space-between" mb={3}>
          <Heading as="h3" size="md" color="gray.900">
            未使用のURL
          </Heading>
          <Badge variant="outline">{activeUrls.length}件</Badge>
        </Flex>

        {activeUrls.length > 0 ? (
          <Stack gap={3}>
            {activeUrls.map((invite) => (
              <Box key={invite.id}>
                <Card.Root variant="elevated">
                  <Card.Body p={4}>
                    <Flex align="flex-start" justify="space-between" gap={3} mb={3}>
                      <Flex align="flex-start" gap={3} flex={1} minW={0}>
                        <Flex p={2} bg="teal.50" borderRadius="lg">
                          <Icon as={LuLink2} boxSize={4} color="teal.600" />
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Flex align="center" gap={2} mb={1}>
                            <Badge colorPalette="teal" variant="solid" fontSize="xs">
                              未使用
                            </Badge>
                            <Flex align="center" gap={1} fontSize="xs" color="gray.600">
                              <Icon as={LuClock} boxSize={3} />
                              <Text>有効期限: {invite.expiresInDays}日</Text>
                            </Flex>
                          </Flex>
                          <Text fontSize="xs" color="gray.500" truncate mb={2}>
                            {invite.url}
                          </Text>
                          <Flex align="center" gap={3} fontSize="xs" color="gray.600">
                            <Text>作成: {invite.createdAt}</Text>
                            <Text>作成者: {invite.createdBy}</Text>
                          </Flex>
                        </Box>
                      </Flex>
                    </Flex>

                    <Flex gap={2}>
                      <Button
                        size="sm"
                        onClick={() => handleCopyUrl(invite.url, invite.id)}
                        flex={1}
                        colorPalette="teal"
                        gap={2}
                      >
                        {copiedId === invite.id ? (
                          <>
                            <Icon as={LuCheck} boxSize={4} />
                            コピー済み
                          </>
                        ) : (
                          <>
                            <Icon as={LuCopy} boxSize={4} />
                            コピー
                          </>
                        )}
                      </Button>
                      <Button size="sm" onClick={() => handleDeleteUrl(invite.id)} colorPalette="red" gap={2}>
                        <Icon as={LuTrash2} boxSize={4} />
                        削除
                      </Button>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Box>
            ))}
          </Stack>
        ) : (
          <Card.Root variant="elevated">
            <Card.Body p={8} textAlign="center">
              <Icon as={LuLink2} boxSize={12} color="gray.300" mx="auto" mb={3} />
              <Text fontSize="sm" color="gray.500">
                未使用のURLはありません
              </Text>
            </Card.Body>
          </Card.Root>
        )}
      </Box>

      {/* 使用済みURL */}
      <Box>
        <Flex align="center" justify="space-between" mb={3}>
          <Heading as="h3" size="md" color="gray.900">
            使用済みのURL
          </Heading>
          <Badge variant="outline" borderColor="gray.300" color="gray.700">
            {usedUrls.length}件
          </Badge>
        </Flex>

        {usedUrls.length > 0 ? (
          <Stack gap={3}>
            {usedUrls.map((invite) => (
              <Box key={invite.id}>
                <Card.Root variant="subtle" bg="gray.50">
                  <Card.Body p={4}>
                    <Flex align="flex-start" gap={3}>
                      <Flex p={2} bg="gray.100" borderRadius="lg">
                        <Icon as={LuLink2} boxSize={4} color="gray.400" />
                      </Flex>
                      <Box flex={1} minW={0}>
                        <Flex align="center" gap={2} mb={1}>
                          <Badge variant="outline" borderColor="gray.300" color="gray.600" bg="gray.100" fontSize="xs">
                            使用済み
                          </Badge>
                        </Flex>
                        <Text fontSize="xs" color="gray.500" truncate mb={2}>
                          {invite.url}
                        </Text>
                        <Flex align="center" gap={3} fontSize="xs" color="gray.600">
                          <Text>作成: {invite.createdAt}</Text>
                          <Text>使用: {invite.usedAt}</Text>
                        </Flex>
                      </Box>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Box>
            ))}
          </Stack>
        ) : (
          <Card.Root variant="elevated">
            <Card.Body p={8} textAlign="center">
              <Icon as={LuLink2} boxSize={12} color="gray.300" mx="auto" mb={3} />
              <Text fontSize="sm" color="gray.500">
                使用済みのURLはありません
              </Text>
            </Card.Body>
          </Card.Root>
        )}
      </Box>
    </Stack>
  );
};
