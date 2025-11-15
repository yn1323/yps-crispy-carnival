import { Box, Button, Card, Field, Flex, Heading, Icon, Input, List, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuInfo, LuLink2, LuMail, LuSend } from "react-icons/lu";

type SendTabProps = {
  shopId: string;
};

export const SendTab = ({ shopId }: SendTabProps) => {
  const [email, setEmail] = useState("");
  const [showAlert, setShowAlert] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSendInvitation = () => {
    if (!email) {
      // TODO: エラー表示
      return;
    }
    // TODO: 実際のAPI呼び出し
    console.log("メール招待送信:", email, "shopId:", shopId);
    setEmail("");
  };

  const handleGenerateUrl = async () => {
    setIsGenerating(true);
    // TODO: 実際のAPI呼び出し
    setTimeout(() => {
      setIsGenerating(false);
      console.log("招待URL生成:", shopId);
    }, 1000);
  };

  return (
    <Box>
      <Card.Root variant="elevated">
        <Card.Body p={{ base: 4, md: 6 }}>
          <Flex align="flex-start" gap={3} mb={4}>
            <Flex p={2} bg="teal.50" borderRadius="lg">
              <Icon as={LuMail} boxSize={5} color="teal.600" />
            </Flex>
            <Box flex={1}>
              <Heading as="h3" size="md" color="gray.900" mb={1}>
                メールアドレスで招待
              </Heading>
              <Text fontSize="xs" color="gray.600">
                相手にすぐ通知が届きます（推奨）
              </Text>
            </Box>
          </Flex>

          {/* 注意事項 */}
          {showAlert && (
            <Box mb={4} p={4} bg="teal.50" borderRadius="md" borderLeft="4px solid" borderColor="teal.200">
              <Flex gap={3}>
                <Icon as={LuInfo} boxSize={4} color="teal.600" mt={0.5} flexShrink={0} />
                <Box flex={1}>
                  <Text fontSize="xs" color="teal.800">
                    <List.Root as="ul" gap={1} pl={5}>
                      <List.Item>招待URLの有効期限は30日間です</List.Item>
                      <List.Item>1つのURLは1回のみ使用可能です</List.Item>
                      <List.Item>複数のスタッフを招待する場合は個別に送信してください</List.Item>
                    </List.Root>
                    <Button
                      variant="plain"
                      onClick={() => setShowAlert(false)}
                      color="teal.700"
                      textDecoration="underline"
                      mt={2}
                      fontSize="xs"
                      p={0}
                      h="auto"
                    >
                      閉じる
                    </Button>
                  </Text>
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
                size="lg"
              />
            </Field.Root>
            <Button
              onClick={handleSendInvitation}
              w="full"
              colorPalette="teal"
              variant="solid"
              size="lg"
              gap={2}
              disabled={!email}
            >
              <Icon as={LuSend} boxSize={4} />
              招待メールを送信
            </Button>
          </Stack>

          <Box position="relative" my={6}>
            <Box position="absolute" inset={0} display="flex" alignItems="center">
              <Box w="full" borderTop="1px" borderColor="gray.200" />
            </Box>
            <Flex position="relative" justify="center" fontSize="xs">
              <Text px={2} bg="white" color="gray.500">
                または
              </Text>
            </Flex>
          </Box>

          <Flex align="flex-start" gap={3} mb={3}>
            <Flex p={2} bg="gray.50" borderRadius="lg">
              <Icon as={LuLink2} boxSize={5} color="gray.600" />
            </Flex>
            <Box flex={1}>
              <Heading as="h4" size="sm" color="gray.900" mb={1}>
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
            w="full"
            borderColor="gray.300"
            color="gray.700"
            gap={2}
            loading={isGenerating}
          >
            <Icon as={LuLink2} boxSize={4} />
            招待URLを生成
          </Button>
        </Card.Body>
      </Card.Root>
    </Box>
  );
};
