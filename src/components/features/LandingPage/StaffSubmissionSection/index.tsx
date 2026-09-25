import { Badge, Box, Container, Flex, Icon, Image, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuCalendarDays, LuClock3, LuHistory, LuMail, LuPencilLine, LuUsers } from "react-icons/lu";
import submitDateSelectionImage from "@/src/assets/screens/submit-date-selection.webp";
import submitPatternSelectionImage from "@/src/assets/screens/submit-pattern-selection.webp";
import submitTimeImage from "@/src/assets/screens/submit-time.webp";
import { getProductFeatureHref } from "@/src/components/features/ProductFeatures/productFeatureRoutes";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";

const submissionMethods: Array<{
  icon: IconType;
  title: string;
  body: string;
  badge: string;
  imageSrc: string;
  imageAlt: string;
}> = [
  {
    icon: LuClock3,
    title: "時間指定",
    body: "働ける時間を日ごとに入力します。",
    badge: "飲食店・小売店向け",
    imageSrc: submitTimeImage,
    imageAlt: "時間指定で希望シフトを提出する画面",
  },
  {
    icon: LuCalendarDays,
    title: "日付選択",
    body: "出勤できる日を選びます。",
    badge: "勤務時間が決まっている職場向け",
    imageSrc: submitDateSelectionImage,
    imageAlt: "日付選択で希望シフトを提出する画面",
  },
  {
    icon: LuUsers,
    title: "パターン選択",
    body: "早番・遅番などから選びます。",
    badge: "介護・施設向け",
    imageSrc: submitPatternSelectionImage,
    imageAlt: "パターン選択で希望シフトを提出する画面",
  },
];

const staffConveniences: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuHistory,
    title: "前回と同じ希望を入力",
    body: "前回と同じ曜日・時間を、ボタン1つで入力できます。",
  },
  {
    icon: LuMail,
    title: "LINEがない人にはメールで",
    body: "LINE未連携の人には、メールで届きます。",
  },
  {
    icon: LuPencilLine,
    title: "提出期限までは出し直せる",
    body: "予定が変わっても、提出期限までは変更できます。",
  },
];

export const StaffSubmissionSection = () => (
  <Box
    as="section"
    id="staff-submission"
    bg="#fbfefe"
    py={{ base: 14, md: 18 }}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <VStack gap={3} textAlign="center">
        <SectionHeading phrases={["スタッフは", "アプリもログインも不要"]} textAlign="center" />
        <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.8">
          提出方法は、お店に合わせて3つから選べます。
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} mt={{ base: 8, md: 10 }}>
        {submissionMethods.map((method) => (
          <SubmissionMethodCard key={method.title} {...method} />
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 5, md: 8 }} mt={{ base: 10, md: 12 }}>
        {staffConveniences.map((item) => (
          <Flex key={item.title} align="flex-start" gap={4}>
            <Flex
              align="center"
              justify="center"
              flexShrink={0}
              boxSize={11}
              bg="white"
              color="teal.700"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="full"
            >
              <Icon as={item.icon} boxSize={5} aria-hidden />
            </Flex>
            <Box minW={0}>
              <Text as="h3" color="gray.950" fontSize="md" fontWeight="bold" lineHeight="1.55">
                {item.title}
              </Text>
              <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.8">
                {item.body}
              </Text>
            </Box>
          </Flex>
        ))}
      </SimpleGrid>

      <Flex justify="center" mt={{ base: 10, md: 12 }}>
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
  badge,
  imageSrc,
  imageAlt,
}: {
  icon: IconType;
  title: string;
  body: string;
  badge: string;
  imageSrc: string;
  imageAlt: string;
}) => (
  <Box
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
        {/* 説明の行数が違っても、下の画面とbadgeの位置をカード間でそろえる。 */}
        <Text mt={1} minH={{ md: "3.4em" }} color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
          {body}
        </Text>
      </Box>
    </Flex>
    <Flex align="flex-start" justify="center" h="178px" mt={5} bg="teal.50" borderRadius="lg" overflow="hidden">
      <Image src={imageSrc} alt={imageAlt} h="370px" maxW="none" objectFit="contain" loading="lazy" decoding="async" />
    </Flex>
    <Badge
      display="flex"
      w="fit-content"
      mx="auto"
      mt={4}
      colorPalette="green"
      variant="subtle"
      borderRadius="full"
      px={3}
      py={1}
    >
      {badge}
    </Badge>
  </Box>
);
