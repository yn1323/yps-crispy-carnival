"use client";

import { Badge, Box, Button, Card, Container, Field, Flex, Heading, Input, Stack, Tabs, Text } from "@chakra-ui/react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
  HiArrowLeft,
  HiCheckCircle,
  HiClipboardCopy,
  HiClock,
  HiExclamation,
  HiLink,
  HiMail,
  HiTrash,
  HiUserAdd,
} from "react-icons/hi";

export const InviteShopMember = () => {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const shopId = params.shopId as string;

  const [email, setEmail] = useState("");
  const [showAlert, setShowAlert] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // モックデータ
  const shopName = "カフェ渋谷店";

  const invitationUrls = [
    {
      id: "1",
      url: "https://shift.app/invite/abc123xyz",
      status: "未使用" as const,
      createdAt: "11/1",
      createdBy: "山田太郎",
      expiresInDays: 23,
    },
    {
      id: "2",
      url: "https://shift.app/invite/def456uvw",
      status: "未使用" as const,
      createdAt: "11/5",
      createdBy: "佐藤花子",
      expiresInDays: 27,
    },
    {
      id: "3",
      url: "https://shift.app/invite/ghi789rst",
      status: "使用済み" as const,
      createdAt: "10/25",
      createdBy: "山田太郎",
      usedAt: "10/26",
    },
  ];

  const invitationHistory = [
    {
      id: "1",
      name: "佐藤花子",
      email: "sato@example.com",
      status: "参加済み" as const,
      invitedAt: "11/1",
      joinedAt: "11/3",
      invitedBy: "山田太郎",
    },
    {
      id: "2",
      name: "鈴木一郎",
      email: "suzuki@example.com",
      status: "参加済み" as const,
      invitedAt: "10/20",
      joinedAt: "10/22",
      invitedBy: "山田太郎",
    },
    {
      id: "3",
      email: "tanaka@example.com",
      status: "招待中" as const,
      invitedAt: "11/1",
      invitedBy: "佐藤花子",
    },
    {
      id: "4",
      email: "ito@example.com",
      status: "招待中" as const,
      invitedAt: "11/4",
      invitedBy: "山田太郎",
    },
  ];

  const handleSendInvitation = () => {
    if (!email) {
      console.log("メールアドレスを入力してください");
      return;
    }
    console.log("招待メールを送信しました");
    setEmail("");
  };

  const handleGenerateUrl = () => {
    console.log("招待URLを生成しました");
  };

  const handleCopyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      console.log("URLをコピーしました");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("コピーに失敗しました:", err);
    }
  };

  const handleDeleteUrl = (inviteId: string) => {
    if (confirm("この招待を削除しますか？使用できなくなります。")) {
      console.log("招待削除:", inviteId);
    }
  };

  const activeUrls = invitationUrls.filter((u) => u.status === "未使用");
  const usedUrls = invitationUrls.filter((u) => u.status === "使用済み");
  const joinedStaff = invitationHistory.filter((h) => h.status === "参加済み");
  const pendingInvites = invitationHistory.filter((h) => h.status === "招待中");

  return (
    <Container maxW="6xl" py={{ base: 4, md: 8 }}>
      <Stack gap={{ base: 4, md: 6 }}>
        {/* ヘッダー */}
        <Box>
          <Button
            onClick={() => navigate({ to: `/shops/${shopId}` })}
            variant="ghost"
            mb={{ base: 3, md: 4 }}
            ml={-2}
            color="gray.600"
          >
            <HiArrowLeft />
            店舗詳細に戻る
          </Button>

          <Flex align="center" gap={3} mb={2}>
            <Flex p={2} bg="teal.50" borderRadius="lg">
              <HiUserAdd size={20} color="var(--chakra-colors-teal-600)" />
            </Flex>
            <Heading size="xl" color="gray.900">
              スタッフ招待
            </Heading>
          </Flex>
          <Text fontSize="sm" color="gray.600">
            {shopName}
          </Text>
        </Box>

        {/* タブコンテンツ */}
        <Tabs.Root defaultValue="send" variant="enclosed">
          <Tabs.List gridTemplateColumns="repeat(3, 1fr)" mb={4}>
            <Tabs.Trigger value="send" gap={2}>
              <HiMail size={16} />
              <Text display={{ base: "none", sm: "inline" }}>招待を送る</Text>
              <Text display={{ base: "inline", sm: "none" }}>送る</Text>
            </Tabs.Trigger>
            <Tabs.Trigger value="manage" gap={2}>
              <HiLink size={16} />
              <Text display={{ base: "none", sm: "inline" }}>招待管理</Text>
              <Text display={{ base: "inline", sm: "none" }}>管理</Text>
            </Tabs.Trigger>
            <Tabs.Trigger value="staff" gap={2}>
              <HiUserAdd size={16} />
              <Text display={{ base: "none", sm: "inline" }}>スタッフ</Text>
              <Text display={{ base: "inline", sm: "none" }}>履歴</Text>
            </Tabs.Trigger>
          </Tabs.List>

          {/* 招待を送る */}
          <Tabs.Content value="send">
            <Card.Root borderWidth={0} shadow="sm">
              <Card.Body p={{ base: 4, md: 6 }}>
                <Flex align="start" gap={3} mb={4}>
                  <Flex p={2} bg="teal.50" borderRadius="lg">
                    <HiMail size={20} color="var(--chakra-colors-teal-600)" />
                  </Flex>
                  <Box flex={1}>
                    <Heading size="md" color="gray.900" mb={1}>
                      メールアドレスで招待
                    </Heading>
                    <Text fontSize="xs" color="gray.600">
                      相手にすぐ通知が届きます（推奨）
                    </Text>
                  </Box>
                </Flex>

                {/* 注意事項 */}
                {showAlert && (
                  <Box mb={4} p={4} borderWidth={1} borderColor="teal.200" bg="teal.50" borderRadius="md">
                    <Flex gap={3}>
                      <HiExclamation size={16} color="var(--chakra-colors-teal-600)" style={{ flexShrink: 0 }} />
                      <Box flex={1}>
                        <Stack gap={1} fontSize="xs" color="teal.800">
                          <Text>• 招待URLの有効期限は30日間です</Text>
                          <Text>• 1つのURLは1回のみ使用可能です</Text>
                          <Text>• 複数のスタッフを招待する場合は個別に送信してください</Text>
                        </Stack>
                        <Button
                          onClick={() => setShowAlert(false)}
                          variant="plain"
                          size="xs"
                          color="teal.700"
                          textDecoration="underline"
                          mt={2}
                          p={0}
                        >
                          閉じる
                        </Button>
                      </Box>
                    </Flex>
                  </Box>
                )}

                <Stack gap={3}>
                  <Field.Root>
                    <Input
                      type="email"
                      placeholder="例: tanaka@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      borderColor="gray.300"
                    />
                  </Field.Root>
                  <Button onClick={handleSendInvitation} bg="teal.600" color="white" w="full" gap={2}>
                    <HiMail size={16} />
                    招待メールを送信
                  </Button>
                </Stack>

                <Box position="relative" my={6}>
                  <Box position="absolute" inset={0} display="flex" alignItems="center">
                    <Box w="full" borderTopWidth={1} borderColor="gray.200" />
                  </Box>
                  <Flex justify="center" position="relative" fontSize="xs">
                    <Text px={2} bg="white" color="gray.500">
                      または
                    </Text>
                  </Flex>
                </Box>

                <Flex align="start" gap={3} mb={3}>
                  <Flex p={2} bg="gray.50" borderRadius="lg">
                    <HiLink size={20} color="var(--chakra-colors-gray-600)" />
                  </Flex>
                  <Box flex={1}>
                    <Heading size="sm" color="gray.900" mb={1}>
                      招待URLを生成
                    </Heading>
                    <Text fontSize="xs" color="gray.600">
                      URLを直接共有したい場合
                    </Text>
                  </Box>
                </Flex>

                <Button
                  onClick={handleGenerateUrl}
                  variant="outline"
                  borderColor="gray.300"
                  color="gray.700"
                  w="full"
                  gap={2}
                >
                  <HiLink size={16} />
                  招待URLを生成
                </Button>
              </Card.Body>
            </Card.Root>
          </Tabs.Content>

          {/* 招待管理 */}
          <Tabs.Content value="manage">
            <Stack gap={4}>
              {/* 未使用URL */}
              <Box>
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading size="md" color="gray.900">
                    未使用のURL
                  </Heading>
                  <Badge variant="outline" borderColor="teal.300" color="teal.700" bg="teal.50">
                    {activeUrls.length}件
                  </Badge>
                </Flex>

                {activeUrls.length > 0 ? (
                  <Stack gap={3}>
                    {activeUrls.map((invite) => (
                      <Card.Root key={invite.id} borderWidth={0} shadow="sm">
                        <Card.Body p={4}>
                          <Flex justify="space-between" align="start" gap={3} mb={3}>
                            <Flex align="start" gap={3} flex={1} minW={0}>
                              <Flex p={2} bg="teal.50" borderRadius="lg">
                                <HiLink size={16} color="var(--chakra-colors-teal-600)" />
                              </Flex>
                              <Box flex={1} minW={0}>
                                <Flex align="center" gap={2} mb={1}>
                                  <Badge bg="teal.600" color="white" fontSize="xs">
                                    未使用
                                  </Badge>
                                  <Flex align="center" gap={1} fontSize="xs" color="gray.600">
                                    <HiClock size={12} />
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
                              variant="outline"
                              onClick={() => handleCopyUrl(invite.url, invite.id)}
                              flex={1}
                              borderColor="teal.300"
                              color="teal.700"
                              bg="teal.50"
                              gap={2}
                            >
                              {copiedId === invite.id ? (
                                <>
                                  <HiCheckCircle size={16} />
                                  コピー済み
                                </>
                              ) : (
                                <>
                                  <HiClipboardCopy size={16} />
                                  コピー
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteUrl(invite.id)}
                              borderColor="red.300"
                              color="red.700"
                              bg="red.50"
                              gap={2}
                            >
                              <HiTrash size={16} />
                              削除
                            </Button>
                          </Flex>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </Stack>
                ) : (
                  <Card.Root borderWidth={0} shadow="sm">
                    <Card.Body p={8} textAlign="center">
                      <HiLink size={48} color="var(--chakra-colors-gray-300)" style={{ margin: "0 auto 12px" }} />
                      <Text fontSize="sm" color="gray.500">
                        未使用のURLはありません
                      </Text>
                    </Card.Body>
                  </Card.Root>
                )}
              </Box>

              {/* 使用済みURL */}
              <Box>
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading size="md" color="gray.900">
                    使用済みのURL
                  </Heading>
                  <Badge variant="outline" borderColor="gray.300" color="gray.700">
                    {usedUrls.length}件
                  </Badge>
                </Flex>

                {usedUrls.length > 0 ? (
                  <Stack gap={3}>
                    {usedUrls.map((invite) => (
                      <Card.Root key={invite.id} borderWidth={0} shadow="sm" bg="gray.50">
                        <Card.Body p={4}>
                          <Flex align="start" gap={3}>
                            <Flex p={2} bg="gray.100" borderRadius="lg">
                              <HiLink size={16} color="var(--chakra-colors-gray-400)" />
                            </Flex>
                            <Box flex={1} minW={0}>
                              <Flex align="center" gap={2} mb={1}>
                                <Badge
                                  variant="outline"
                                  borderColor="gray.300"
                                  color="gray.600"
                                  bg="gray.100"
                                  fontSize="xs"
                                >
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
                    ))}
                  </Stack>
                ) : (
                  <Card.Root borderWidth={0} shadow="sm">
                    <Card.Body p={8} textAlign="center">
                      <HiLink size={48} color="var(--chakra-colors-gray-300)" style={{ margin: "0 auto 12px" }} />
                      <Text fontSize="sm" color="gray.500">
                        使用済みのURLはありません
                      </Text>
                    </Card.Body>
                  </Card.Root>
                )}
              </Box>
            </Stack>
          </Tabs.Content>

          {/* スタッフタブ */}
          <Tabs.Content value="staff">
            <Tabs.Root defaultValue="joined" variant="enclosed">
              <Tabs.List gridTemplateColumns="repeat(2, 1fr)" mb={4}>
                <Tabs.Trigger value="joined" gap={2}>
                  <HiUserAdd size={16} />
                  参加済み
                  <Badge variant="outline" borderColor="teal.300" color="teal.700" bg="teal.50" ml={1}>
                    {joinedStaff.length}
                  </Badge>
                </Tabs.Trigger>
                <Tabs.Trigger value="pending" gap={2}>
                  <HiMail size={16} />
                  招待中
                  <Badge variant="outline" borderColor="orange.300" color="orange.700" bg="orange.50" ml={1}>
                    {pendingInvites.length}
                  </Badge>
                </Tabs.Trigger>
              </Tabs.List>

              {/* 参加済みタブ */}
              <Tabs.Content value="joined">
                {joinedStaff.length > 0 ? (
                  <Stack gap={3}>
                    {joinedStaff.map((staff) => (
                      <Card.Root key={staff.id} borderWidth={0} shadow="sm">
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
                                <HiUserAdd size={20} />
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
                            <Badge bg="teal.600" color="white" fontSize="xs" flexShrink={0}>
                              参加済み
                            </Badge>
                          </Flex>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </Stack>
                ) : (
                  <Card.Root borderWidth={0} shadow="sm">
                    <Card.Body p={8} textAlign="center">
                      <HiUserAdd size={48} color="var(--chakra-colors-gray-300)" style={{ margin: "0 auto 12px" }} />
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
                      <Card.Root key={invite.id} borderWidth={0} shadow="sm">
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
                                <HiMail size={20} />
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
                            <Badge bg="orange.600" color="white" fontSize="xs" flexShrink={0}>
                              招待中
                            </Badge>
                          </Flex>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </Stack>
                ) : (
                  <Card.Root borderWidth={0} shadow="sm">
                    <Card.Body p={8} textAlign="center">
                      <HiMail size={48} color="var(--chakra-colors-gray-300)" style={{ margin: "0 auto 12px" }} />
                      <Text fontSize="sm" color="gray.500">
                        招待中のスタッフはいません
                      </Text>
                    </Card.Body>
                  </Card.Root>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Container>
  );
};
