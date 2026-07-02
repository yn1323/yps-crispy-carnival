import { Badge, Box, Container, Flex, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarDays, LuClock3, LuUsers } from "react-icons/lu";
import { SectionHeading } from "../SectionHeading";
import dayImage from "../SubmissionMethodsSection/function-shift-by-day.webp";
import selectionImage from "../SubmissionMethodsSection/function-shift-by-selection.webp";
import timeImage from "../SubmissionMethodsSection/function-shift-by-time.webp";

const submissionTypes: Array<{
  icon: IconType;
  title: string;
  body: string;
  badge: string;
  imageSrc: string;
  imageAlt: string;
}> = [
  {
    icon: LuCalendarDays,
    title: "出勤の可否のみ",
    body: "出勤日を選ぶシンプルな方式",
    badge: "短時間シフト向け",
    imageSrc: dayImage,
    imageAlt: "日ごとに希望シフトを提出する画面",
  },
  {
    icon: LuClock3,
    title: "時間入力",
    body: "出勤可能時間を入力してもらう方式",
    badge: "飲食店・小売店向け",
    imageSrc: timeImage,
    imageAlt: "時間入力で希望シフトを提出する画面",
  },
  {
    icon: LuUsers,
    title: "勤務区分",
    body: "朝番・昼番・夜番など区分から選ぶ方式",
    badge: "介護・施設向け",
    imageSrc: selectionImage,
    imageAlt: "勤務区分で希望シフトを提出する画面",
  },
];

export const SubmissionTypesSection = () => (
  <Box as="section" bg="#fbfefe" py={16}>
    <Container maxW="7xl">
      <VStack gap={9}>
        <VStack gap={3} textAlign="center">
          <SectionHeading phrases={["選べる3タイプのシフト希望表"]} />
          <Text color="gray.700" fontSize="md" lineHeight="1.8" fontWeight="semibold">
            営業スタイルにフィットする形で回収できます
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} w="full">
          {submissionTypes.map((type) => (
            <SubmissionTypeCard key={type.title} {...type} />
          ))}
        </SimpleGrid>
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
    <Flex align="flex-start" justify="center" h="178px" mt={5} bg="teal.50" borderRadius="lg" overflow="hidden">
      <Image src={imageSrc} alt={imageAlt} h="370px" maxW="none" objectFit="contain" />
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
