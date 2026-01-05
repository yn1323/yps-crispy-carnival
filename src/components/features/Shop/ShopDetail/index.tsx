import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Icon,
  Separator,
  Stack,
  Text,
  Wrap,
} from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LuCalendar, LuClock, LuPencil, LuStore, LuUsers } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { Animation } from "@/src/components/templates/Animation";
import { Empty } from "@/src/components/ui/Empty";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { Title } from "@/src/components/ui/Title";
import { convertSubmitFrequency, convertTimeUnit } from "@/src/helpers/domain/convertShopData";

type ShopDetailProps = {
  shop: Doc<"shops">;
  positions: Doc<"shopPositions">[];
};

export const ShopDetail = ({ shop, positions }: ShopDetailProps) => {
  const navigate = useNavigate();

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: "/shops", label: "店舗一覧に戻る" }}
        action={
          <Button
            onClick={() => {
              navigate({ to: "/shops/$shopId/edit", params: { shopId: shop._id } });
            }}
            colorPalette="teal"
            gap={2}
          >
            <Icon as={LuPencil} boxSize={4} />
            <Text display={{ base: "none", md: "inline" }}>編集</Text>
          </Button>
        }
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={3}>
            <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
              <Icon as={LuStore} boxSize={6} color="teal.600" />
            </Flex>
            <Heading as="h2" size="xl" color="gray.900">
              {shop.shopName}
            </Heading>
          </Flex>
        </Flex>
      </Title>

      {/* 店舗情報 */}
      <Animation>
        <Card.Root borderWidth={0} shadow="sm">
          <Card.Body p={{ base: 4, md: 6 }}>
            {/* 詳細情報グリッド */}
            <Box>
              {/* 営業時間 */}
              <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                <Icon as={LuClock} boxSize={5} color="gray.500" />
                <Box flex={1}>
                  <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                    営業時間
                  </Text>
                  <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                    {shop.openTime} - {shop.closeTime}
                  </Text>
                </Box>
              </Flex>

              {/* シフト提出期限 */}
              <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                <Icon as={LuCalendar} boxSize={5} color="gray.500" />
                <Box flex={1}>
                  <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                    シフト提出期限
                  </Text>
                  <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                    {convertSubmitFrequency.toLabel(shop.submitFrequency)}
                  </Text>
                </Box>
              </Flex>

              {/* シフト入力の時間単位 */}
              <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
                <Icon as={LuClock} boxSize={5} color="gray.500" />
                <Box flex={1}>
                  <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                    シフト入力の時間単位
                  </Text>
                  <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                    {convertTimeUnit.toLabel(shop.timeUnit)}
                  </Text>
                </Box>
              </Flex>

              {/* ポジション */}
              <Flex align="flex-start" gap={3}>
                <Icon as={LuUsers} boxSize={5} color="gray.500" />
                <Box flex={1}>
                  <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={1.5}>
                    ポジション
                  </Text>
                  {positions.length > 0 ? (
                    <Wrap gap={2}>
                      {positions.map((position) => (
                        <Badge key={position._id} colorPalette="teal" variant="subtle" size={{ base: "sm", md: "md" }}>
                          {position.name}
                        </Badge>
                      ))}
                    </Wrap>
                  ) : (
                    <Text fontSize={{ base: "sm", md: "base" }} color="gray.400">
                      未設定
                    </Text>
                  )}
                </Box>
              </Flex>
            </Box>

            {/* 説明 */}
            {shop.description && (
              <>
                <Separator my={4} />
                <Box>
                  <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={2}>
                    説明
                  </Text>
                  <Text fontSize={{ base: "sm", md: "base" }} color="gray.700" lineHeight="relaxed">
                    {shop.description}
                  </Text>
                </Box>
              </>
            )}
          </Card.Body>
        </Card.Root>
      </Animation>
    </Container>
  );
};

export const ShopDetailLoading = () => {
  return <LoadingState />;
};

export const ShopDetailNotFound = () => (
  <Empty
    icon={LuStore}
    title="店舗が見つかりません"
    description="指定された店舗は存在しないか、削除された可能性があります"
    action={
      <Link to="/shops">
        <Button colorPalette="teal" size="lg">
          店舗一覧に戻る
        </Button>
      </Link>
    }
  />
);

export const ShopDetailError = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="red.500">
          エラーが発生しました
        </Heading>
        <Text color="fg.muted">店舗情報の取得中にエラーが発生しました</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};
