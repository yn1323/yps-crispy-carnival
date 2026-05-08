import { Box, Container, Flex, Heading, Icon, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuCheck, LuSend } from "react-icons/lu";
import featureCollectImage from "./feature-collect.webp";
import featureSendImage from "./feature-send.webp";
import shiftFormImage from "./hero-pc.webp";

type FeatureVisualType = "collect" | "remind" | "shift" | "notify";

const featureCards: {
  number: string;
  title: string;
  body: string;
  visual: FeatureVisualType;
  featured?: boolean;
}[] = [
  {
    number: "1",
    title: "希望を集める",
    body: "スタッフはいつものLINEから希望を提出。専用アプリのインストールなしで、シフト作成の入口をシンプルにできます。",
    visual: "collect",
  },
  {
    number: "2",
    title: "未提出に気づける",
    body: "作成画面の中で未提出者に気づけるので、必要な人だけに声をかけられます。",
    visual: "remind",
  },
  {
    number: "3",
    title: "シフト表を作る",
    body: "集まった希望を見ながら、日別にシフト表を作成。未提出の状況や確定通知まで、作る流れの中でそのまま進められます。",
    visual: "shift",
    featured: true,
  },
  {
    number: "4",
    title: "確定シフトを届ける",
    body: "完成したシフトはLINE・メールでまとめて通知。毎月用の表を作り直したり、個別に送り直したりする手間を減らせます。",
    visual: "notify",
  },
];

export const FeatureSection = () => (
  <Box as="section" bg="#eaf8f7" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <VStack gap={{ base: 10, md: 12 }}>
        <VStack gap={5} textAlign="center">
          <Text
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            bg="whiteAlpha.800"
            color="teal.700"
            borderRadius="full"
            px={6}
            py={2}
            textStyle="md"
            fontWeight="bold"
          >
            できること
          </Text>
          <Heading as="h2" color="gray.950" textStyle="sectionTitle" lineHeight="1.25">
            <Box as="span" color="teal.700">
              シフトリで、
            </Box>
            シフト作成に必要な作業をまとめて
          </Heading>
          <Text color="gray.700" textStyle={{ base: "body", md: "lg" }} lineHeight="1.9" maxW="820px">
            希望集めから、未提出の確認、シフト表の作成、スタッフへの通知まで、
            <Box as="span" display={{ base: "inline", md: "block" }}>
              シフト作成に必要な作業を、ひとつの流れでサポートします。
            </Box>
          </Text>
        </VStack>

        <VStack gap={{ base: 4, md: 6 }} w="full">
          {featureCards.map((card) => (
            <CapabilityCard key={card.number} {...card} />
          ))}
        </VStack>
      </VStack>
    </Container>
  </Box>
);

const CapabilityCard = ({
  number,
  title,
  body,
  visual,
  featured,
}: {
  number: string;
  title: string;
  body: string;
  visual: FeatureVisualType;
  featured?: boolean;
}) => (
  <SimpleGrid
    columns={{ base: 1, lg: 3 }}
    gap={{ base: 6, lg: 8 }}
    alignItems={{ base: "center", lg: "stretch" }}
    w="full"
    bg="white"
    borderRadius={{ base: "2xl", md: "3xl" }}
    px={{ base: 5, md: 9 }}
    py={{ base: 7, md: featured ? 9 : 7, lg: 0 }}
    boxShadow="0 18px 42px rgba(15, 23, 42, 0.06)"
    overflow="hidden"
  >
    <Flex
      align="center"
      gap={{ base: 5, md: 8 }}
      gridColumn={{ base: "auto", lg: "span 2" }}
      py={{ lg: featured ? 9 : 7 }}
    >
      <Text
        flex="0 0 auto"
        color="teal.100"
        fontSize={{ base: "6xl", md: featured ? "8xl" : "7xl" }}
        lineHeight="1"
        fontWeight="black"
        minW={{ base: "64px", md: "96px" }}
        textAlign="center"
      >
        {number}
      </Text>
      <VStack align="start" gap={{ base: 3, md: 4 }} minW={0}>
        <Heading as="h3" color="teal.700" textStyle={{ base: "2xl", md: featured ? "4xl" : "3xl" }} lineHeight="1.35">
          {title}
        </Heading>
        <Text color="gray.800" textStyle={{ base: "body", md: "lg" }} lineHeight="1.9" fontWeight="semibold">
          {body}
        </Text>
      </VStack>
    </Flex>

    <FeatureVisual type={visual} featured={featured} />
  </SimpleGrid>
);

const featureImageVisuals: Partial<Record<FeatureVisualType, string>> = {
  collect: featureCollectImage,
  notify: featureSendImage,
};

const FeatureVisual = ({ type, featured }: { type: FeatureVisualType; featured?: boolean }) => {
  const imageSrc = featureImageVisuals[type];

  return (
    <Flex
      position="relative"
      align="center"
      justify="center"
      alignSelf={{ lg: "stretch" }}
      h={{ lg: "100%" }}
      minH={{ base: featured ? "240px" : "180px", md: featured ? "270px" : "190px" }}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          w={{ base: "full", lg: "100%" }}
          h={{ lg: "100%" }}
          maxW={{ base: "300px", md: "360px", lg: "none" }}
          maxH={{ base: featured ? "240px" : "180px", md: featured ? "270px" : "190px", lg: "none" }}
          objectFit="contain"
          filter="drop-shadow(0 18px 26px rgba(15, 23, 42, 0.12))"
          loading="lazy"
        />
      )}
      {type === "remind" && <RemindVisual />}
      {type === "shift" && <ShiftVisual />}
    </Flex>
  );
};

const RemindVisual = () => (
  <Box position="relative" w="full" h={{ base: "220px", md: "190px" }} maxW="380px" mx="auto">
    <Box
      h="full"
      bg="white"
      borderWidth="1px"
      borderColor="teal.100"
      borderRadius="3xl"
      overflow="hidden"
      boxShadow="0 18px 34px rgba(15, 23, 42, 0.1)"
    >
      <Flex
        h="36px"
        align="center"
        justify="space-between"
        gap={3}
        px={4}
        bg="teal.50"
        borderBottomWidth="1px"
        borderColor="teal.100"
      >
        <Text color="teal.800" textStyle="caption" fontWeight="bold">
          5/11週のシフト作成
        </Text>
        <Text
          bg="orange.50"
          color="orange.600"
          borderRadius="full"
          px={2.5}
          py={1}
          textStyle="caption"
          fontWeight="bold"
        >
          未提出 2
        </Text>
      </Flex>

      <Flex h="calc(100% - 36px)" gap={3} p={3}>
        <VStack align="stretch" flex="1" gap={2} minW={0}>
          {[
            { name: "鈴木", time: "10:00 - 16:00", status: "ok" },
            { name: "田中", time: "未提出", status: "missing" },
            { name: "山田", time: "14:00 - 21:00", status: "ok" },
            { name: "小林", time: "未提出", status: "missing" },
          ].map((row) => (
            <Flex key={row.name} align="center" gap={2} minH="26px">
              <Text color="gray.700" textStyle="caption" fontWeight="bold" w="36px">
                {row.name}
              </Text>
              {row.status === "missing" ? (
                <Text
                  color="orange.600"
                  bg="orange.50"
                  borderRadius="full"
                  px={2}
                  py={1}
                  textStyle="caption"
                  fontWeight="bold"
                >
                  {row.time}
                </Text>
              ) : (
                <Box flex="1" h="12px" borderRadius="full" bg="teal.500">
                  <Text srOnly>{row.time}</Text>
                </Box>
              )}
            </Flex>
          ))}
        </VStack>

        <VStack
          align="stretch"
          justify="space-between"
          w={{ base: "126px", md: "136px" }}
          bg="white"
          borderWidth="1px"
          borderColor="orange.100"
          borderRadius="2xl"
          px={3}
          py={3}
        >
          <Box>
            <Text color="gray.950" textStyle="sm" fontWeight="bold" lineHeight="1.35">
              未提出者
            </Text>
            <Text mt={1.5} color="gray.600" textStyle="caption" fontWeight="bold" lineHeight="1.5">
              田中次郎
              <Box as="span" display="block">
                小林大輔
              </Box>
            </Text>
          </Box>
          <Text
            bg="teal.600"
            color="white"
            borderRadius="full"
            px={3}
            py={1.5}
            textStyle="caption"
            fontWeight="bold"
            textAlign="center"
          >
            LINEで確認
          </Text>
        </VStack>
      </Flex>
    </Box>

    <Flex
      position="absolute"
      right={{ base: 3, md: 4 }}
      bottom="-10px"
      align="center"
      gap={1.5}
      bg="white"
      color="teal.700"
      borderWidth="1px"
      borderColor="teal.100"
      borderRadius="full"
      px={3}
      py={2}
      textStyle="caption"
      fontWeight="bold"
      boxShadow="0 12px 24px rgba(15, 23, 42, 0.12)"
    >
      <Icon as={LuCheck} boxSize={4} />
      作成中に気づける
    </Flex>
  </Box>
);

const ShiftVisual = () => (
  <Box position="relative" w="full" maxW={{ base: "360px", md: "520px" }} mx="auto">
    <Image
      src={shiftFormImage}
      alt="シフト表を作る画面イメージ"
      w="full"
      objectFit="contain"
      filter="drop-shadow(0 18px 26px rgba(15, 23, 42, 0.16))"
      loading="lazy"
    />
    <FloatingPanel
      top={{ base: "38%", md: "42%" }}
      left={{ base: "-8px", md: "-18px" }}
      icon={LuCalendarCheck}
      title="希望を見ながら作成"
      body="転記せず、そのまま調整"
      compact
    />
    <Flex
      position="absolute"
      right={{ base: "-2px", md: "-10px" }}
      bottom={{ base: "18px", md: "28px" }}
      align="center"
      gap={2}
      bg="white"
      color="teal.700"
      borderWidth="1px"
      borderColor="teal.100"
      borderRadius="full"
      px={{ base: 3, md: 4 }}
      py={{ base: 2, md: 2.5 }}
      boxShadow="0 12px 24px rgba(15, 23, 42, 0.12)"
      textStyle={{ base: "caption", md: "sm" }}
      fontWeight="bold"
    >
      <Icon as={LuSend} boxSize={4} />
      確定後に通知
    </Flex>
  </Box>
);

const FloatingPanel = ({
  icon,
  title,
  body,
  compact,
  ...position
}: {
  icon: IconType;
  title: string;
  body: string;
  compact?: boolean;
  top?: string | { base: string; md: string };
  bottom?: string | { base: string; md: string };
  left?: string | { base: string; md: string };
  right?: string | { base: string; md: string };
}) => (
  <Flex
    position="absolute"
    {...position}
    align="center"
    gap={3}
    bg="white"
    borderWidth="1px"
    borderColor="teal.100"
    borderRadius="2xl"
    px={compact ? { base: 3, md: 4 } : 4}
    py={compact ? { base: 2.5, md: 3 } : 3}
    boxShadow="0 16px 32px rgba(15, 23, 42, 0.12)"
  >
    <Flex
      boxSize={compact ? { base: 9, md: 10 } : 11}
      borderRadius="full"
      bg="teal.50"
      color="teal.700"
      align="center"
      justify="center"
    >
      <Icon as={icon} boxSize={compact ? 5 : 6} />
    </Flex>
    <Box minW={0}>
      <Text
        color="gray.950"
        textStyle={compact ? { base: "caption", md: "sm" } : "md"}
        fontWeight="bold"
        lineHeight="1.3"
      >
        {title}
      </Text>
      <Text color="teal.700" textStyle="caption" fontWeight="bold" mt={1}>
        {body}
      </Text>
    </Box>
  </Flex>
);
