import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { formatPublicPlanStartingPrice, type PublicPlanPriceCatalog } from "@/src/domains/publicPricing";

type TrialReassuranceProps = {
  prices: PublicPlanPriceCatalog;
};

export function TrialReassurance({ prices }: TrialReassuranceProps) {
  const conditions = [
    // 各項目は折り返さないため、幅360pxのスマートフォンにも一行で収まる長さにする。
    "カード登録不要の2か月無料トライアル",
    // Freeの上限は人数・店舗・管理者の3条件あるため、一行に収まらない数値は料金sectionで示す。
    "トライアル後もFreeプランで無料",
    `有料プランは${formatPublicPlanStartingPrice(prices)}`,
  ];

  return (
    <Flex
      as="ul"
      align="center"
      columnGap={5}
      rowGap={2}
      flexWrap="wrap"
      m={0}
      p={0}
      color="gray.700"
      fontSize="sm"
      fontWeight="semibold"
      listStyleType="none"
      aria-label="料金の条件"
    >
      {conditions.map((condition) => (
        <Flex as="li" key={condition} align="center" gap={2} whiteSpace="nowrap">
          <Icon as={LuCheck} boxSize={4} color="teal.600" flexShrink={0} aria-hidden />
          <Text as="span">{condition}</Text>
        </Flex>
      ))}
    </Flex>
  );
}
