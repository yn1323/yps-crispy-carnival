import { Badge, Box, Card, Flex, Icon, Separator, Text } from "@chakra-ui/react";
import { LuCalendar, LuClock, LuCreditCard, LuMapPin } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { Animation } from "@/src/components/templates/Animation";
import { convertSubmitFrequency } from "@/src/helpers/domain/convertShopData";

type InfoTabProps = {
  shop: Doc<"shops">;
};

export const InfoTab = ({ shop }: InfoTabProps) => {
  return (
    <Animation>
      <Card.Root borderWidth={0} shadow="sm">
        <Card.Body p={{ base: 4, md: 6 }}>
          {/* 住所（固定値） */}
          <Flex align="center" gap={2} mb={4} pb={4} borderBottom="1px" borderColor="gray.100">
            <Icon as={LuMapPin} boxSize={5} color="gray.500" />
            <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
              東京都新宿区西新宿1-1-1
            </Text>
          </Flex>

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

            {/* シフト閉鎖時間（固定値） */}
            <Flex align="flex-start" gap={3} mb={{ base: 3, md: 4 }}>
              <Icon as={LuClock} boxSize={5} color="gray.500" />
              <Box flex={1}>
                <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={0.5}>
                  シフト閉鎖時間
                </Text>
                <Text fontSize={{ base: "sm", md: "base" }} color="gray.900">
                  30分
                </Text>
              </Box>
            </Flex>

            {/* タイムカード */}
            <Flex align="flex-start" gap={3}>
              <Icon as={LuCreditCard} boxSize={5} color="gray.500" />
              <Box flex={1}>
                <Text fontSize={{ base: "xs", md: "sm" }} color="gray.500" mb={1}>
                  タイムカード
                </Text>
                <Badge
                  variant="outline"
                  fontSize="xs"
                  borderColor={shop.useTimeCard ? "teal.300" : "gray.300"}
                  color={shop.useTimeCard ? "teal.700" : "gray.600"}
                  bg={shop.useTimeCard ? "teal.50" : "transparent"}
                >
                  {shop.useTimeCard ? "利用中" : "未利用"}
                </Badge>
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
  );
};
