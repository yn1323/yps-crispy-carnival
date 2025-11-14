import { Badge, Box, Button, Container, Flex, Heading, Stack, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronRight, LuClock, LuMapPin, LuPlus, LuStore, LuUsers } from "react-icons/lu";

type ShopListProps = {
  shops: {
    _id: string;
    shopName: string;
    openTime: string;
    closeTime: string;
    submitFrequency: string;
    useTimeCard: boolean;
  }[];
};

export const ShopList = ({ shops }: ShopListProps) => {
  return (
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      {/* ヘッダー */}
      <Box mb={{ base: 4, md: 6 }}>
        <Flex align="center" justify="space-between" mb="2">
          <Box>
            <Text as="h2" color="gray.900" mb="1">
              店舗一覧
            </Text>
            <Text fontSize="sm" color="gray.600">
              {shops.length}店舗
            </Text>
          </Box>
          <Link to="/shops/new">
            <Button colorPalette="teal" gap="2" display={{ base: "none", md: "flex" }}>
              <LuPlus size={16} />
              新規店舗
            </Button>
          </Link>
        </Flex>
      </Box>

      {/* 店舗カード一覧 */}
      <VStack gap="3">
        {shops.map((shop) => (
          <Box key={shop._id} w="full">
            <Link to="/shops/$shopId" params={{ shopId: shop._id }}>
              <Box
                bg="white"
                borderRadius="lg"
                boxShadow="sm"
                _hover={{ boxShadow: "md" }}
                transition="all 0.15s"
                cursor="pointer"
                role="group"
                p={{ base: 4, md: 5 }}
              >
                <Flex align="center" justify="space-between" gap="4">
                  <Flex align="center" gap={{ base: 3, md: 4 }} flex="1" minW="0">
                    {/* アイコン */}
                    <Flex
                      p={{ base: 2.5, md: 3 }}
                      bgGradient="to-br"
                      gradientFrom="teal.50"
                      gradientTo="teal.100"
                      borderRadius="xl"
                      flexShrink="0"
                      _groupHover={{ gradientFrom: "teal.100", gradientTo: "teal.200" }}
                      transition="all 0.15s"
                    >
                      <LuStore size={24} color="var(--chakra-colors-teal-600)" />
                    </Flex>

                    {/* 店舗情報 */}
                    <VStack flex="1" minW="0" align="start" gap="2">
                      <Flex align="center" gap="2">
                        <Text as="h3" color="gray.900" truncate>
                          {shop.shopName}
                        </Text>
                        <Badge colorPalette="teal" variant="solid" fontSize="xs" flexShrink="0">
                          マネージャー
                        </Badge>
                      </Flex>

                      {/* 住所 */}
                      <Flex align="center" gap="2" fontSize="sm" color="gray.600">
                        <LuMapPin size={16} />
                        <Text truncate>東京都新宿区西新宿1-1-1</Text>
                      </Flex>

                      {/* 詳細情報 */}
                      <Flex align="center" gap="4" fontSize="sm">
                        <Flex align="center" gap="1.5" color="gray.600">
                          <LuClock size={16} color="var(--chakra-colors-gray-400)" />
                          <Text>
                            {shop.openTime} - {shop.closeTime}
                          </Text>
                        </Flex>
                        <Flex align="center" gap="1.5" color="gray.600">
                          <LuUsers size={16} color="var(--chakra-colors-gray-400)" />
                          <Text>15名</Text>
                        </Flex>
                      </Flex>
                    </VStack>
                  </Flex>

                  {/* 矢印アイコン */}
                  <Box
                    color="gray.400"
                    flexShrink="0"
                    _groupHover={{ color: "teal.600", transform: "translateX(4px)" }}
                    transition="all 0.15s"
                  >
                    <LuChevronRight size={20} />
                  </Box>
                </Flex>
              </Box>
            </Link>
          </Box>
        ))}
      </VStack>

      {/* モバイル用新規店舗ボタン */}
      <Box mt="6" display={{ base: "block", md: "none" }}>
        <Link to="/shops/new">
          <Button w="full" colorPalette="teal" gap="2">
            <LuPlus size={16} />
            新規店舗を追加
          </Button>
        </Link>
      </Box>
    </Container>
  );
};

export const ShopListEmpty = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="fg.muted">
          店舗がまだ登録されていません
        </Heading>
        <Text color="fg.muted">まずは店舗を登録してシフト管理を始めましょう</Text>
        <Link to="/shops/new">
          <Button colorPalette="teal" size="lg">
            <LuPlus />
            店舗を登録する
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};
