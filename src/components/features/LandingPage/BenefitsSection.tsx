import { Box, Container, Flex, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuClipboardList, LuMessageCircle, LuSend, LuSmartphone, LuUsers } from "react-icons/lu";
import makerImage from "./side-maker.webp";
import userImage from "./side-user.webp";

const makerBenefits = [
  {
    icon: LuClipboardList,
    title: "希望を一覧で確認",
    body: "集まった希望を画面でまとめて見られます。",
  },
  {
    icon: LuUsers,
    title: "未提出者がわかる",
    body: "声をかける相手をすぐに絞れます。",
  },
  {
    icon: LuSend,
    title: "確定シフトを共有",
    body: "スタッフへの通知をまとめて送れます。",
  },
];

const staffBenefits = [
  {
    icon: LuMessageCircle,
    title: "LINEから提出",
    body: "いつものトークから希望を送れます。",
  },
  {
    icon: LuSmartphone,
    title: "専用アプリ不要",
    body: "新しいアプリを入れずに使えます。",
  },
  {
    icon: LuCalendarCheck,
    title: "確定後も確認しやすい",
    body: "通知からシフトを見返せます。",
  },
];

export const BenefitsSection = () => (
  <Box as="section" bg="white" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <VStack gap={{ base: 10, md: 12 }}>
        <VStack gap={5} textAlign="center">
          <Heading
            as="h2"
            color="gray.950"
            fontSize={{ base: "2xl", md: "4xl", xl: "5xl" }}
            lineHeight={{ base: "2rem", md: "3rem", xl: "3.75rem" }}
          >
            <Box as="span" color="teal.700">
              作る人・出す人
            </Box>
            にもやさしく
          </Heading>
          <Box w="56px" h="6px" bg="teal.600" borderRadius="full" />
          <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="720px">
            管理者の手間と、スタッフの提出負担をどちらも減らします。
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 5, md: 6 }} w="full">
          <BenefitCard
            title="シフトを作る人"
            imageSrc={makerImage}
            imageAlt="シフトを作る人のイメージ"
            lead="回収・確認・共有をひとつに"
            body="転記や共有の手間を減らせます。"
            tone="teal"
            items={makerBenefits}
          />
          <BenefitCard
            title="シフトを出す人"
            imageSrc={userImage}
            imageAlt="シフトを出す人のイメージ"
            lead="いつものLINEから提出"
            body="新しいアプリや難しい操作なしで使えます。"
            tone="amber"
            items={staffBenefits}
          />
        </SimpleGrid>
      </VStack>
    </Container>
  </Box>
);

const BenefitCard = ({
  title,
  imageSrc,
  imageAlt,
  lead,
  body,
  tone,
  items,
}: {
  title: string;
  imageSrc: string;
  imageAlt: string;
  lead: string;
  body: string;
  tone: "teal" | "amber";
  items: Array<{ icon: IconType; title: string; body: string }>;
}) => {
  const surface = tone === "teal" ? "teal.50" : "orange.50";

  return (
    <Box
      bg={surface}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="2xl"
      px={{ base: 5, md: 8 }}
      py={{ base: 6, md: 8 }}
    >
      <VStack align="stretch" gap={{ base: 6, md: 7 }}>
        <Flex align="center" gap={{ base: 4, md: 6 }}>
          <Flex
            align="center"
            justify="center"
            flex="0 0 auto"
            boxSize={{ base: 24, md: 32 }}
            bg="whiteAlpha.800"
            borderRadius="2xl"
          >
            <Image src={imageSrc} alt={imageAlt} w="full" h="full" objectFit="contain" borderRadius="xl" />
          </Flex>
          <Box>
            <Heading as="h3" color="teal.700" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.35">
              {title}
            </Heading>
            <Text mt={3} color="gray.950" textStyle={{ base: "sm", md: "md" }} fontWeight="bold" lineHeight="1.7">
              {lead}
            </Text>
            <Text mt={2} color="gray.700" textStyle="sm" lineHeight="1.7">
              {body}
            </Text>
          </Box>
        </Flex>

        <Box borderTopWidth="1px" borderTopColor="teal.200" />

        <VStack align="stretch" gap={{ base: 5, md: 6 }}>
          {items.map((item) => (
            <BenefitItem key={item.title} {...item} />
          ))}
        </VStack>
      </VStack>
    </Box>
  );
};

const BenefitItem = ({ icon, title, body }: { icon: IconType; title: string; body: string }) => (
  <Flex align="start" gap={{ base: 4, md: 5 }}>
    <Flex
      align="center"
      justify="center"
      flex="0 0 auto"
      boxSize={{ base: 11, md: 14 }}
      bg="white"
      color="teal.700"
      borderWidth="1px"
      borderColor="teal.100"
      borderRadius="full"
    >
      <Icon as={icon} boxSize={{ base: 6, md: 7 }} />
    </Flex>
    <Box>
      <Text color="gray.950" textStyle={{ base: "md", md: "md" }} fontWeight="bold" lineHeight="1.55">
        {title}
      </Text>
      <Text mt={1} color="gray.700" textStyle="sm" lineHeight="1.7">
        {body}
      </Text>
    </Box>
  </Flex>
);
