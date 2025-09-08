"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  Field,
  Flex,
  Grid,
  Heading,
  IconButton,
  Input,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
  HiArrowLeft,
  HiCheckCircle,
  HiClipboardCopy,
  HiClock,
  HiExclamation,
  HiEye,
  HiLink,
  HiMail,
  HiTrash,
  HiUserAdd,
} from "react-icons/hi";
import { Animation } from "@/src/components/templates/Animation";

// 仮のデータ
const getMockInviteData = (_shopId: string) => {
  return {
    shopName: "カフェ渋谷店",
    activeInvitations: [
      {
        id: "1",
        token: "abc123def456",
        createdAt: "2024-12-18",
        expiresAt: "2025-01-17",
        usedCount: 1,
        maxUses: null,
        createdBy: "山田次郎",
        url: "https://example.com/invite/abc123def456",
      },
      {
        id: "2",
        token: "xyz789uvw012",
        createdAt: "2024-12-15",
        expiresAt: "2025-01-14",
        usedCount: 0,
        maxUses: null,
        createdBy: "山田次郎",
        url: "https://example.com/invite/xyz789uvw012",
      },
      {
        id: "3",
        token: "def456ghi789",
        createdAt: "2024-12-20",
        expiresAt: "2025-01-19",
        usedCount: 0,
        maxUses: null,
        createdBy: "山田次郎",
        url: "https://example.com/invite/def456ghi789",
      },
    ],
    inviteHistory: [
      {
        id: "4",
        userName: "鈴木美咲",
        invitedAt: "2024-12-10",
        joinedAt: "2024-12-10",
        invitedBy: "山田次郎",
        status: "joined",
      },
      {
        id: "5",
        userName: "招待メール送信",
        invitedAt: "2024-12-08",
        joinedAt: null,
        invitedBy: "山田次郎",
        status: "pending",
        email: "tanaka@example.com",
      },
    ],
  };
};

export const InviteShopMember = () => {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const shopId = params.id as string;

  const inviteData = getMockInviteData(shopId);
  const [emailAddress, setEmailAddress] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleGenerateInviteURL = async () => {
    setIsGenerating(true);
    // TODO: 実際のAPI呼び出し
    setTimeout(() => {
      setIsGenerating(false);
      // 新しい招待URLを生成したとして、リストを更新
    }, 1000);
  };

  const handleSendEmailInvite = async () => {
    if (!emailAddress) {
      return;
    }

    // TODO: 実際のAPI呼び出し
    console.log("メール招待送信:", emailAddress);
    setEmailAddress("");
  };

  const handleCopyURL = async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      console.error("コピーに失敗しました:", err);
    }
  };

  const handleDeleteInvite = (inviteId: string) => {
    if (confirm("この招待を削除しますか？使用できなくなります。")) {
      // TODO: 実際の削除処理
      console.log("招待削除:", inviteId);
    }
  };

  return (
    <Animation>
      <Container maxW="container.lg" py={8}>
        <VStack gap={6} align="stretch">
          {/* ヘッダー */}
          <Box>
            <Button onClick={() => navigate({ to: `/shops/${shopId}` })} variant="ghost" mb={4}>
              <HiArrowLeft />
              店舗詳細に戻る
            </Button>
            <Heading size="xl" mb={2}>
              スタッフ招待管理
            </Heading>
            <Text color="fg.muted">{inviteData.shopName}の新しいスタッフを招待・管理できます</Text>
          </Box>

          {/* 新しい招待作成 */}
          <Card.Root variant="elevated">
            <Card.Header>
              <Heading size="md">
                <HiUserAdd style={{ display: "inline", marginRight: "8px" }} />
                新しいスタッフを招待
              </Heading>
              <Text fontSize="sm" color="fg.muted" mt={2}>
                以下の方法でスタッフを招待できます。招待は1回限り有効です。
              </Text>
            </Card.Header>
            <Card.Body>
              <VStack gap={6} align="stretch">
                {/* 推奨：メール招待 */}
                <Card.Root variant="elevated" colorPalette="blue">
                  <Card.Header>
                    <Flex align="center" justify="space-between">
                      <Flex align="center" gap={3}>
                        <Box bg="blue.500" color="white" borderRadius="full" p={2}>
                          <HiMail size={20} />
                        </Box>
                        <Box>
                          <Text fontWeight="bold" fontSize="lg">
                            メール招待
                          </Text>
                          <Badge colorPalette="blue" variant="solid" size="sm">
                            推奨
                          </Badge>
                        </Box>
                      </Flex>
                    </Flex>
                  </Card.Header>
                  <Card.Body>
                    <VStack gap={4} align="stretch">
                      <Box bg="blue.50" p={4} borderRadius="md" _dark={{ bg: "blue.900" }}>
                        <Text fontSize="sm" color="blue.700" _dark={{ color: "blue.200" }} mb={2}>
                          📧 <strong>こんな時におすすめ：</strong>
                        </Text>
                        <Stack gap={1}>
                          <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                            • 新しいスタッフのメールアドレスを知っている
                          </Text>
                          <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                            • 確実に本人に届けたい
                          </Text>
                          <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                            • 1対1で招待したい
                          </Text>
                        </Stack>
                      </Box>

                      <VStack gap={3} align="stretch">
                        <Text fontSize="sm" fontWeight="medium">
                          ステップ 1: メールアドレスを入力
                        </Text>
                        <Field.Root>
                          <Field.Label>招待したいスタッフのメールアドレス</Field.Label>
                          <Input
                            type="email"
                            placeholder="staff@example.com"
                            value={emailAddress}
                            onChange={(e) => setEmailAddress(e.target.value)}
                            size="lg"
                          />
                        </Field.Root>

                        <Text fontSize="sm" fontWeight="medium">
                          ステップ 2: 招待メールを送信
                        </Text>
                        <Button
                          onClick={handleSendEmailInvite}
                          colorPalette="blue"
                          variant="solid"
                          disabled={!emailAddress}
                          size="lg"
                          width="full"
                        >
                          <HiMail />
                          招待メールを送信
                        </Button>
                      </VStack>
                    </VStack>
                  </Card.Body>
                </Card.Root>

                {/* その他の方法：招待URL */}
                <Card.Root variant="outline">
                  <Card.Header>
                    <Flex align="center" gap={3}>
                      <Box bg="gray.400" color="white" borderRadius="full" p={2}>
                        <HiLink size={20} />
                      </Box>
                      <Box>
                        <Text fontWeight="bold">招待URL生成</Text>
                        <Text fontSize="sm" color="fg.muted">
                          その他の方法
                        </Text>
                      </Box>
                    </Flex>
                  </Card.Header>
                  <Card.Body>
                    <VStack gap={4} align="stretch">
                      <Box bg="gray.50" p={4} borderRadius="md" _dark={{ bg: "gray.800" }}>
                        <Text fontSize="sm" color="gray.700" _dark={{ color: "gray.300" }} mb={2}>
                          🔗 <strong>こんな時に使用：</strong>
                        </Text>
                        <Stack gap={1}>
                          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                            • LINE・Slackなどで招待したい
                          </Text>
                          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                            • メールアドレスが分からない
                          </Text>
                          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                            • 面接時に直接渡したい
                          </Text>
                        </Stack>
                      </Box>

                      <VStack gap={3} align="stretch">
                        <Text fontSize="sm" fontWeight="medium">
                          ステップ 1: 招待URLを生成
                        </Text>
                        <Button onClick={handleGenerateInviteURL} variant="outline" loading={isGenerating} width="full">
                          <HiLink />
                          招待URLを生成
                        </Button>
                        <Text fontSize="xs" color="orange.600" textAlign="center">
                          ⚠️ 生成されたURLは1回のみ使用可能です
                        </Text>
                      </VStack>
                    </VStack>
                  </Card.Body>
                </Card.Root>
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* 招待一覧 */}
          <Card.Root>
            <Card.Header>
              <Flex justify="space-between" align="center">
                <Heading size="md">
                  <HiEye style={{ display: "inline", marginRight: "8px" }} />
                  招待一覧
                </Heading>
                <Flex gap={2}>
                  <Badge colorPalette="teal" variant="subtle">
                    未使用 {inviteData.activeInvitations.filter((i) => i.usedCount === 0).length}件
                  </Badge>
                  <Badge colorPalette="gray" variant="subtle">
                    使用済み {inviteData.activeInvitations.filter((i) => i.usedCount > 0).length}件
                  </Badge>
                </Flex>
              </Flex>
            </Card.Header>
            <Card.Body>
              {inviteData.activeInvitations.length === 0 ? (
                <Text color="fg.muted" textAlign="center" py={8}>
                  招待がありません
                </Text>
              ) : (
                <Stack gap={4}>
                  {inviteData.activeInvitations.map((invite) => {
                    const isUsed = invite.usedCount > 0;
                    return (
                      <Card.Root
                        key={invite.id}
                        variant="subtle"
                        opacity={isUsed ? 0.6 : 1}
                        bg={isUsed ? "gray.50" : "bg.muted"}
                        _dark={{ bg: isUsed ? "gray.800" : "bg.muted" }}
                      >
                        <Card.Body>
                          <Stack gap={4}>
                            <Flex justify="space-between" align="start">
                              <Box flex={1}>
                                <Flex align="center" gap={2} mb={2}>
                                  <Text fontWeight="medium" color={isUsed ? "fg.muted" : "fg"}>
                                    招待URL
                                  </Text>
                                  <Badge
                                    size="sm"
                                    colorPalette={isUsed ? "gray" : "green"}
                                    variant={isUsed ? "outline" : "subtle"}
                                  >
                                    {isUsed ? "使用済み" : "未使用"}
                                  </Badge>
                                  {isUsed && (
                                    <Text fontSize="xs" color="fg.muted">
                                      (1回限り使用済み)
                                    </Text>
                                  )}
                                </Flex>
                                <Code
                                  fontSize="sm"
                                  p={2}
                                  borderRadius="md"
                                  bg={isUsed ? "gray.100" : "bg.muted"}
                                  width="full"
                                  overflow="hidden"
                                  color={isUsed ? "fg.muted" : "fg"}
                                  _dark={{
                                    bg: isUsed ? "gray.800" : "gray.700",
                                    color: isUsed ? "gray.500" : "fg",
                                  }}
                                >
                                  {invite.url}
                                </Code>
                              </Box>
                              <Flex gap={2} ml={4}>
                                {!isUsed && (
                                  <IconButton
                                    onClick={() => handleCopyURL(invite.url, invite.token)}
                                    variant="ghost"
                                    colorPalette={copiedToken === invite.token ? "green" : "gray"}
                                    aria-label="URLをコピー"
                                    size="sm"
                                  >
                                    {copiedToken === invite.token ? <HiCheckCircle /> : <HiClipboardCopy />}
                                  </IconButton>
                                )}
                                <IconButton
                                  onClick={() => handleDeleteInvite(invite.id)}
                                  variant="ghost"
                                  colorPalette="red"
                                  aria-label={isUsed ? "招待を削除" : "招待をキャンセル"}
                                  size="sm"
                                >
                                  <HiTrash />
                                </IconButton>
                              </Flex>
                            </Flex>

                            <Grid templateColumns="repeat(auto-fit, minmax(120px, 1fr))" gap={4}>
                              <Box>
                                <Text fontSize="xs" color="fg.muted">
                                  作成日
                                </Text>
                                <Text fontSize="sm" color={isUsed ? "fg.muted" : "fg"}>
                                  {invite.createdAt}
                                </Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="fg.muted">
                                  {isUsed ? "使用期限" : "有効期限"}
                                </Text>
                                <Text fontSize="sm" color={isUsed ? "fg.muted" : "fg"}>
                                  {invite.expiresAt}
                                </Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="fg.muted">
                                  作成者
                                </Text>
                                <Text fontSize="sm" color={isUsed ? "fg.muted" : "fg"}>
                                  {invite.createdBy}
                                </Text>
                              </Box>
                            </Grid>
                          </Stack>
                        </Card.Body>
                      </Card.Root>
                    );
                  })}
                </Stack>
              )}
            </Card.Body>
          </Card.Root>

          {/* 招待履歴 */}
          <Card.Root>
            <Card.Header>
              <Heading size="md">
                <HiClock style={{ display: "inline", marginRight: "8px" }} />
                招待履歴
              </Heading>
            </Card.Header>
            <Card.Body>
              <Stack gap={3}>
                {inviteData.inviteHistory.map((history) => (
                  <Flex key={history.id} justify="space-between" align="center" p={3} borderRadius="md" bg="bg.muted">
                    <Box>
                      <Flex align="center" gap={2} mb={1}>
                        <Text fontWeight="medium">{history.userName}</Text>
                        <Badge
                          colorPalette={history.status === "joined" ? "green" : "orange"}
                          variant="subtle"
                          size="sm"
                        >
                          {history.status === "joined" ? "参加済み" : "招待中"}
                        </Badge>
                      </Flex>
                      <Text fontSize="sm" color="fg.muted">
                        招待日: {history.invitedAt}
                        {history.joinedAt && ` | 参加日: ${history.joinedAt}`}
                        {history.email && ` | ${history.email}`}
                      </Text>
                    </Box>
                    <Text fontSize="sm" color="fg.muted">
                      招待者: {history.invitedBy}
                    </Text>
                  </Flex>
                ))}
              </Stack>
            </Card.Body>
          </Card.Root>

          {/* 招待に関する注意事項 */}
          <Card.Root bg="blue.50" borderLeft="4px solid" borderColor="blue.400" _dark={{ bg: "blue.900" }}>
            <Card.Body py={4}>
              <Flex gap={3}>
                <HiExclamation size={20} color="blue" style={{ marginTop: "2px", flexShrink: 0 }} />
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="blue.700" _dark={{ color: "blue.200" }} mb={2}>
                    📋 招待に関する重要な注意事項
                  </Text>
                  <Stack gap={1}>
                    <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                      • 招待URLの有効期限は30日間です
                    </Text>
                    <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                      • <strong>1つの招待URLは1回のみ使用できます</strong>
                    </Text>
                    <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                      • 使用済みの招待は自動的に無効化されます
                    </Text>
                    <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                      • メール招待は相手にすぐに通知されます
                    </Text>
                    <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                      • 複数のスタッフを招待する場合は、それぞれ個別に招待してください
                    </Text>
                  </Stack>
                </Box>
              </Flex>
            </Card.Body>
          </Card.Root>
        </VStack>
      </Container>
    </Animation>
  );
};
