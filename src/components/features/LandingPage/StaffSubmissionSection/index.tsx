import { Box, Container, Flex, Icon, Image, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuCalendarDays, LuClock3, LuUsers } from "react-icons/lu";
import submitDateSelectionImage from "@/src/assets/screens/submit-date-selection.webp";
import submitPatternSelectionImage from "@/src/assets/screens/submit-pattern-selection.webp";
import submitTimeImage from "@/src/assets/screens/submit-time.webp";
import { getProductFeatureHref } from "@/src/components/features/ProductFeatures/productFeatureRoutes";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";
import careImage from "./store-care.webp";
import eventImage from "./store-event.webp";
import restaurantImage from "./store-restaurant.webp";
import retailImage from "./store-retail.webp";
import salonImage from "./store-salon.webp";

type Store = { label: string; imageSrc: string };

// 導入実績ではなく、提出方法とお店の働き方の相性として書く。
const submissionMethods: Array<{
  icon: IconType;
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  stores: Store[];
}> = [
  {
    icon: LuClock3,
    title: "時間指定",
    body: "働ける時間を入力します",
    imageSrc: submitTimeImage,
    imageAlt: "時間指定で希望シフトを提出する画面",
    stores: [
      { label: "飲食店・カフェ", imageSrc: restaurantImage },
      { label: "小売店", imageSrc: retailImage },
    ],
  },
  {
    icon: LuCalendarDays,
    title: "日付選択",
    body: "出勤できる日を選びます",
    imageSrc: submitDateSelectionImage,
    imageAlt: "日付選択で希望シフトを提出する画面",
    stores: [
      { label: "美容室・サロン", imageSrc: salonImage },
      { label: "イベント運営", imageSrc: eventImage },
    ],
  },
  {
    icon: LuUsers,
    title: "パターン選択",
    body: "早番・遅番などから選びます",
    imageSrc: submitPatternSelectionImage,
    imageAlt: "パターン選択で希望シフトを提出する画面",
    stores: [{ label: "介護・施設", imageSrc: careImage }],
  },
];

// ヘッダーとフッターの「活用例」は、お店との相性を示すこのsectionへ移動する。
export const StaffSubmissionSection = () => (
  <Box
    as="section"
    id="use-cases"
    bg="#fbfefe"
    py={{ base: 14, md: 20 }}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <VStack gap={3} textAlign="center">
        <SectionHeading phrases={["希望シフトの出し方は", "お店に合わせて選べます"]} textAlign="center" />
        <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.8">
          スタッフはアプリもログインも不要です
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} mt={{ base: 8, md: 10 }}>
        {submissionMethods.map((method) => (
          <SubmissionMethodCard key={method.title} {...method} />
        ))}
      </SimpleGrid>

      {/* 前回と同じ入力や出し直しなどの細かい機能は、機能ページで説明する。 */}
      <Flex justify="center" mt={{ base: 8, md: 10 }}>
        <Link
          href={getProductFeatureHref("shift-request-collection")}
          color="teal.700"
          fontWeight="bold"
          display="inline-flex"
          alignItems="center"
          gap={2}
        >
          希望シフトの回収を詳しく見る
          <Icon as={LuArrowRight} boxSize={4} aria-hidden />
        </Link>
      </Flex>
    </Container>
  </Box>
);

const SubmissionMethodCard = ({
  icon,
  title,
  body,
  imageSrc,
  imageAlt,
  stores,
}: {
  icon: IconType;
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  stores: Store[];
}) => (
  <Flex
    direction="column"
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="lg"
    p={6}
    boxShadow="0 14px 28px rgba(15, 23, 42, 0.04)"
  >
    <Flex align="center" gap={4}>
      <Flex
        align="center"
        justify="center"
        flex="0 0 auto"
        boxSize={14}
        color="teal.600"
        bg="teal.50"
        borderRadius="full"
      >
        <Icon as={icon} boxSize={7} aria-hidden />
      </Flex>
      <Box minW={0}>
        <Text as="h3" color="gray.950" fontSize="xl" fontWeight="black" lineHeight="1.4">
          {title}
        </Text>
        {/* 説明の行数が違っても、下の画面の位置をカード間でそろえる。 */}
        <Text mt={1} minH={{ md: "3.4em" }} color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
          {body}
        </Text>
      </Box>
    </Flex>
    <Flex align="flex-start" justify="center" h="178px" mt={5} bg="teal.50" borderRadius="lg" overflow="hidden">
      <Image src={imageSrc} alt={imageAlt} h="370px" maxW="none" objectFit="contain" loading="lazy" decoding="async" />
    </Flex>
    <Box mt={5} pt={4} borderTopWidth="1px" borderColor="gray.100">
      <Text color="gray.600" fontSize="xs" fontWeight="bold" lineHeight="1.5">
        向いているお店
      </Text>
      <Flex as="ul" wrap="wrap" columnGap={5} rowGap={2} mt={2} listStyleType="none" p={0}>
        {stores.map((store) => (
          <Flex as="li" key={store.label} align="center" gap={2}>
            <Image src={store.imageSrc} alt="" boxSize={12} objectFit="contain" loading="lazy" decoding="async" />
            <Text as="span" color="gray.900" fontSize="sm" fontWeight="bold" lineHeight="1.5">
              {store.label}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  </Flex>
);
