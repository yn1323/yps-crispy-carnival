import {
  Badge,
  Box,
  Button,
  Container,
  Field,
  Flex,
  Icon,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { IoChevronForwardSharp, IoSaveSharp, IoTimeSharp } from "react-icons/io5";
import { LuStore, LuUser } from "react-icons/lu";
import { Title } from "@/src/components/ui/Title";

// モックデータ
const mockUser = {
  id: "1",
  name: "田中太郎",
  email: "tanaka@example.com",
};

const mockStores = [
  { id: "1", name: "本店" },
  { id: "2", name: "駅前店" },
  { id: "3", name: "ショッピングモール店" },
];

const mockShiftTemplateCounts: Record<string, number> = {
  "1": 3,
  "2": 2,
  "3": 0,
};

type SettingsPageProps = {
  onNavigateToShiftTemplate?: (storeId: string) => void;
};

export const SettingsPage = ({ onNavigateToShiftTemplate }: SettingsPageProps) => {
  const [userName, setUserName] = useState(mockUser.name);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("1");

  const selectedStore = mockStores.find((s) => s.id === selectedStoreId);
  const templateCount = mockShiftTemplateCounts[selectedStoreId] || 0;

  const handleSaveUserName = () => {
    // toast.success("ユーザー名を更新しました");
  };

  const handleEditShiftTemplates = () => {
    if (onNavigateToShiftTemplate) {
      onNavigateToShiftTemplate(selectedStoreId);
    }
  };

  return (
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      {/* ヘッダー */}
      <Title>個人設定</Title>

      {/* コンテンツ */}

      <VStack gap="6" align="stretch">
        {/* ユーザー設定セクション */}
        <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
          <Flex align="center" gap="2" mb="4">
            <Icon as={LuUser} boxSize={5} color="gray.700" />
            <Text as="h3" color="gray.900">
              ユーザー設定
            </Text>
          </Flex>
          <VStack gap="4" align="stretch">
            <Field.Root>
              <Field.Label>名前</Field.Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="名前を入力" />
            </Field.Root>
            <Field.Root>
              <Field.Label>メールアドレス</Field.Label>
              <Input value={mockUser.email} disabled bg="gray.50" />
              <Field.HelperText>メールアドレスは変更できません</Field.HelperText>
            </Field.Root>
            <Button onClick={handleSaveUserName} w="full" colorPalette="teal" gap="2">
              <Icon as={IoSaveSharp} boxSize={4} />
              変更を保存
            </Button>
          </VStack>
        </Box>

        {/* 店舗別設定セクション */}
        <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
          <Flex align="center" gap="2" mb="4">
            <Icon as={LuStore} boxSize={5} color="gray.700" />
            <Text as="h3" color="gray.900">
              店舗別設定
            </Text>
          </Flex>
          <VStack gap="4" align="stretch">
            {/* 店舗選択 */}
            <Field.Root>
              <Field.Label>店舗を選択</Field.Label>
              <NativeSelectRoot>
                <NativeSelectField value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  {mockStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
            </Field.Root>

            {/* よく使うシフト */}
            <Box
              bg="gray.50"
              borderRadius="lg"
              cursor="pointer"
              onClick={handleEditShiftTemplates}
              p={{ base: 4, md: 6 }}
              role="group"
              _hover={{ bg: "gray.100" }}
              transition="all 0.15s"
            >
              <Flex align="center" justify="space-between" gap="4">
                <Flex align="center" gap="3" flex="1">
                  <Flex p="2" bg="teal.50" borderRadius="lg">
                    <Icon as={IoTimeSharp} boxSize={5} color="teal.600" />
                  </Flex>
                  <Box flex="1">
                    <Flex align="center" gap="2" mb="1">
                      <Text as="h4" color="gray.900">
                        よく使うシフト
                      </Text>
                      <Badge variant="outline" fontSize="xs">
                        {templateCount}件
                      </Badge>
                    </Flex>
                    <Text fontSize="xs" color="gray.600">
                      {selectedStore?.name}でよく使うシフトを管理
                    </Text>
                  </Box>
                </Flex>
                <Box
                  color="gray.400"
                  flexShrink="0"
                  _groupHover={{ color: "teal.600", transform: "translateX(4px)" }}
                  transition="all 0.15s"
                >
                  <Icon as={IoChevronForwardSharp} boxSize={5} />
                </Box>
              </Flex>
            </Box>
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
};
