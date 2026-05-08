import { Box, Container, Flex, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuClipboardList, LuMessageCircle, LuSend, LuSmartphone, LuUsers } from "react-icons/lu";
import makerImage from "./side-maker.webp";
import userImage from "./side-user.webp";

const makerBenefits = [
  {
    icon: LuClipboardList,
    title: "希望を一覧で確認できる",
    body: "集まった希望を見やすく一覧で確認できます。",
  },
  {
    icon: LuUsers,
    title: "未提出のスタッフがすぐわかる",
    body: "未提出の人を一覧で確認できるので、催促の手間が減ります。",
  },
  {
    icon: LuSend,
    title: "確定シフトをまとめて共有できる",
    body: "確定したシフトをワンクリックでスタッフへ通知できます。",
  },
];

const staffBenefits = [
  {
    icon: LuMessageCircle,
    title: "LINEから希望を提出できる",
    body: "いつものLINEトークから、かんたんに希望シフトを送れます。",
  },
  {
    icon: LuSmartphone,
    title: "専用アプリのインストール不要",
    body: "新しいアプリを入れる必要がなく、すぐに使い始められます。",
  },
  {
    icon: LuCalendarCheck,
    title: "確定シフトも確認しやすい",
    body: "確定したシフトは通知されるので、見逃しにくく安心です。",
  },
];

export const BenefitsSection = () => (
  <Box as="section" bg="white" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <VStack gap={{ base: 10, md: 12 }}>
        <VStack gap={5} textAlign="center">
          <Heading as="h2" color="gray.950" textStyle="sectionTitle" lineHeight="1.25">
            シフトを
            <Box as="span" color="teal.700">
              作る人
            </Box>
            にも、
            <Box as="span" color="teal.700">
              出す人
            </Box>
            にもやさしく。
          </Heading>
          <Box w="56px" h="6px" bg="teal.600" borderRadius="full" />
          <Text color="gray.700" textStyle={{ base: "body", md: "lg" }} lineHeight="1.9">
            シフト作成をラクにするには、希望を出す側の使いやすさも大切です。
            <Box as="span" display={{ base: "inline", md: "block" }}>
              シフトリは、いつものLINEを使って、無理なく続けられるシフト管理を目指しました。
            </Box>
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 5, md: 6 }} w="full">
          <BenefitCard
            title="シフトを作る人"
            imageSrc={makerImage}
            imageAlt="シフトを作る人のイメージ"
            lead="希望の回収、未提出の確認、確定シフトの共有までひとつに。"
            body="LINEや紙を見返しながらExcelに入力する手間を減らせます。"
            tone="teal"
            items={makerBenefits}
          />
          <BenefitCard
            title="シフトを出す人"
            imageSrc={userImage}
            imageAlt="シフトを出す人のイメージ"
            lead="いつものLINEから希望シフトを提出。"
            body="新しいアプリを入れたり、むずかしい操作を覚えたりする必要はありません。"
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
            <Image src={imageSrc} alt={imageAlt} w="full" h="full" objectFit="contain" />
          </Flex>
          <Box>
            <Heading as="h3" color="teal.700" textStyle={{ base: "xl", md: "2xl" }} lineHeight="1.35">
              {title}
            </Heading>
            <Text mt={3} color="gray.950" textStyle={{ base: "sm", md: "md" }} fontWeight="bold" lineHeight="1.8">
              {lead}
            </Text>
            <Text mt={2} color="gray.700" textStyle={{ base: "sm", md: "sm" }} lineHeight="1.8">
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
      <Text color="gray.950" textStyle={{ base: "md", md: "lg" }} fontWeight="bold" lineHeight="1.6">
        {title}
      </Text>
      <Text mt={1} color="gray.700" textStyle="sm" lineHeight="1.8">
        {body}
      </Text>
    </Box>
  </Flex>
);
