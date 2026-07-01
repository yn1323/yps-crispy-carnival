import { Badge, Box, Container, Flex, Grid, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarDays, LuCheck, LuClock3, LuMail, LuShieldCheck, LuUsers } from "react-icons/lu";
import dayImage from "../../LandingPage/SubmissionMethodsSection/function-shift-by-day.webp";
import selectionImage from "../../LandingPage/SubmissionMethodsSection/function-shift-by-selection.webp";
import timeImage from "../../LandingPage/SubmissionMethodsSection/function-shift-by-time.webp";

const submissionTypes: Array<{
  icon: IconType;
  title: string;
  body: string;
  badge: string;
  imageSrc: string;
  imageAlt: string;
}> = [
  {
    icon: LuClock3,
    title: "時間入力",
    body: "何時から何時まで働けるか、時間で入力してもらう方式。",
    badge: "飲食店・小売店向け",
    imageSrc: timeImage,
    imageAlt: "時間入力で希望シフトを提出する画面",
  },
  {
    icon: LuCalendarDays,
    title: "日ごと",
    body: "出られる日と出られない日だけを選ぶシンプルな方式。",
    badge: "短時間シフト向け",
    imageSrc: dayImage,
    imageAlt: "日ごとに希望シフトを提出する画面",
  },
  {
    icon: LuUsers,
    title: "勤務区分",
    body: "朝番・昼番・夜番など、区分から選ぶ方式。",
    badge: "介護・施設向け",
    imageSrc: selectionImage,
    imageAlt: "勤務区分で希望シフトを提出する画面",
  },
];

const noAppItems = ["アプリのダウンロード不要", "アカウント作成不要", "パスワード管理不要"];
const channelItems = ["LINE連携済みならLINEで通知", "未連携の人にはメールで通知", "送信に失敗してもメールでフォロー"];

export const SubmissionTypesSection = () => (
  <Box as="section" bg="#fbfefe" py={16}>
    <Container maxW="7xl">
      <VStack gap={9}>
        <VStack gap={3} textAlign="center">
          <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
            シフト希望表を、お店に合わせて3タイプに。
          </Heading>
          <Text color="gray.700" fontSize="md" lineHeight="1.8" fontWeight="semibold">
            スタッフの働き方や店舗の組み方に合わせて、希望の集め方を選べます。
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} w="full">
          {submissionTypes.map((type) => (
            <SubmissionTypeCard key={type.title} {...type} />
          ))}
        </SimpleGrid>

        <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={5} w="full">
          <StaffCard
            title="スタッフはアプリ不要。"
            body="リンクを開いて、スマホで提出するだけ。"
            items={noAppItems}
            visual="phone"
          />
          <StaffCard
            title="LINEの人にはLINE。使わない人にはメール。"
            body="連絡手段が混ざるお店でも、ひとつの画面から送れます。"
            items={channelItems}
            visual="channel"
          />
        </Grid>
      </VStack>
    </Container>
  </Box>
);

const SubmissionTypeCard = ({
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
        boxSize={16}
        color="teal.600"
        bg="teal.50"
        borderRadius="full"
      >
        <Icon as={icon} boxSize={8} />
      </Flex>
      <Box minW={0}>
        <Text color="gray.950" fontSize="xl" fontWeight="black" lineHeight="1.4">
          {title}
        </Text>
        <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
          {body}
        </Text>
      </Box>
    </Flex>
    <Flex align="center" justify="center" h="178px" mt={5} bg="teal.50" borderRadius="lg" overflow="hidden">
      <Image src={imageSrc} alt={imageAlt} h="168px" objectFit="contain" />
    </Flex>
    <Badge mt={4} colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
      {badge}
    </Badge>
  </Box>
);

const StaffCard = ({
  title,
  body,
  items,
  visual,
}: {
  title: string;
  body: string;
  items: string[];
  visual: "phone" | "channel";
}) => (
  <Grid
    templateColumns={{ base: "1fr", md: "168px minmax(0, 1fr)" }}
    gap={6}
    alignItems="center"
    bg="#f2fbfa"
    borderWidth="1px"
    borderColor="teal.100"
    borderRadius="lg"
    p={7}
  >
    <Flex align="center" justify="center" minH="160px">
      {visual === "phone" ? <PhoneIllustration /> : <ChannelIllustration />}
    </Flex>
    <Box>
      <Heading as="h3" fontSize="2xl" lineHeight="1.45" letterSpacing="0">
        {title}
      </Heading>
      <Text mt={2} color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
        {body}
      </Text>
      <VStack align="stretch" gap={2.5} mt={5}>
        {items.map((item) => (
          <Flex key={item} align="center" gap={3}>
            <Icon as={LuCheck} boxSize={5} color="teal.600" />
            <Text color="gray.900" fontSize="sm" fontWeight="bold">
              {item}
            </Text>
          </Flex>
        ))}
      </VStack>
    </Box>
  </Grid>
);

const PhoneIllustration = () => (
  <Box
    position="relative"
    w="82px"
    h="152px"
    bg="white"
    borderWidth="4px"
    borderColor="gray.950"
    borderRadius="24px"
    boxShadow="0 16px 28px rgba(15, 23, 42, 0.12)"
  >
    <Box
      position="absolute"
      insetInlineStart="50%"
      top="7px"
      w="28px"
      h="4px"
      bg="gray.950"
      borderRadius="full"
      transform="translateX(-50%)"
    />
    <VStack gap={2.5} align="stretch" px={3} pt={8}>
      <Text color="teal.700" fontSize="2xs" fontWeight="black">
        シフトリ
      </Text>
      {[0, 1, 2].map((index) => (
        <Flex key={index} align="center" justify="space-between" gap={2}>
          <Box h="8px" flex="1" bg="gray.100" borderRadius="full" />
          <Icon as={index === 1 ? LuShieldCheck : LuCheck} boxSize={3.5} color="teal.600" />
        </Flex>
      ))}
    </VStack>
  </Box>
);

const ChannelIllustration = () => (
  <VStack gap={5} w="full">
    <Flex align="center" gap={4}>
      <Flex
        align="center"
        justify="center"
        boxSize={14}
        bg="teal.500"
        color="white"
        borderRadius="full"
        fontWeight="black"
      >
        LINE
      </Flex>
      <Box w="54px" borderTopWidth="2px" borderStyle="dashed" borderColor="gray.400" />
      <Icon as={LuUsers} boxSize={12} color="gray.700" />
    </Flex>
    <Flex align="center" gap={4}>
      <Flex
        align="center"
        justify="center"
        boxSize={14}
        bg="white"
        color="teal.600"
        borderWidth="1px"
        borderColor="teal.200"
        borderRadius="lg"
      >
        <Icon as={LuMail} boxSize={8} />
      </Flex>
      <Box w="54px" borderTopWidth="2px" borderStyle="dashed" borderColor="gray.400" />
      <Icon as={LuUsers} boxSize={12} color="gray.700" />
    </Flex>
  </VStack>
);
