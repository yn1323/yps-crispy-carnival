import { Badge, Box, Button, Container, Flex, Heading, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronRight, LuClock, LuPlus, LuStore, LuUsers } from "react-icons/lu";
import { Title } from "@/src/components/ui/Title";

type ShopListProps = {
  shops: {
    _id: string;
    shopName: string;
    openTime: string;
    closeTime: string;
    submitFrequency: string;
    useTimeCard: boolean;
    staffCount: number;
  }[];
};

export const ShopList = ({ shops }: ShopListProps) => {
  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        action={
          <Link to="/shops/new">
            <Button colorPalette="teal" gap="2" display={{ base: "none", md: "flex" }}>
              <Icon as={LuPlus} boxSize={4} />
              新規店舗
            </Button>
          </Link>
        }
      >
        店舗一覧
      </Title>

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
                      <Icon as={LuStore} boxSize={6} color="teal.600" />
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

                      {/* 詳細情報 */}
                      <Flex align="center" gap="4" fontSize="sm">
                        <Flex align="center" gap="1.5" color="gray.600">
                          <Icon as={LuClock} boxSize={4} color="gray.400" />
                          <Text>
                            {shop.openTime} - {shop.closeTime}
                          </Text>
                        </Flex>
                        <Flex align="center" gap="1.5" color="gray.600">
                          <Icon as={LuUsers} boxSize={4} color="gray.400" />
                          <Text>{shop.staffCount}名</Text>
                        </Flex>
                      </Flex>
                    </VStack>
                  </Flex>

                  {/* 矢印アイコン */}
                  <Box color="gray.400">
                    <Icon as={LuChevronRight} boxSize={5} />
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
            <Icon as={LuPlus} boxSize={4} />
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
            <Icon as={LuPlus} boxSize={4} />
            店舗を登録する
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};
