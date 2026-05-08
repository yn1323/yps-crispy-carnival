import { Box, Container, Flex, Heading, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import featureCollectImage from "./feature-collect.webp";
import featureSendImage from "./feature-send.webp";
import shiftFormImage from "./hero-pc.webp";
import howtoNoticeImage from "./howto-notice.webp";

type FeatureVisualType = "collect" | "notice" | "shift" | "notify";

const featureCards: {
  number: string;
  title: string;
  body: string;
  visual?: FeatureVisualType;
  featured?: boolean;
}[] = [
  {
    number: "1",
    title: "希望を集める",
    body: "スタッフはいつものLINEから提出。専用アプリなしで始められます。",
    visual: "collect",
  },
  {
    number: "2",
    title: "未提出に気づく",
    body: "作成中に未提出者を確認。必要な人だけに声をかけられます。",
    visual: "notice",
  },
  {
    number: "3",
    title: "シフト表を作る",
    body: "希望を見ながら日別に作成。転記せず、そのまま調整できます。",
    visual: "shift",
    featured: true,
  },
  {
    number: "4",
    title: "確定シフトを届ける",
    body: "完成したシフトをLINE・メールで通知。送り直しの手間を減らします。",
    visual: "notify",
  },
];

export const FeatureSection = () => (
  <Box as="section" id="features" bg="#eaf8f7" py={{ base: 16, md: 24 }}>
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
          <Heading
            as="h2"
            color="gray.950"
            fontSize={{ base: "3xl", md: "4xl", xl: "5xl" }}
            lineHeight={{ base: "2.5rem", md: "3rem", xl: "3.75rem" }}
          >
            <Box as="span" color="teal.700">
              シフトリ
            </Box>
            で 希望回収から通知までひとつに
          </Heading>
          <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="720px">
            未提出確認、シフト表の作成、スタッフへの通知まで、同じ流れで進められます。
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
  visual?: FeatureVisualType;
  featured?: boolean;
}) => {
  const hasVisual = visual !== undefined;

  return (
    <SimpleGrid
      columns={{ base: 1, lg: 3 }}
      gap={{ base: 5, lg: 8 }}
      alignItems={{ base: "center", xl: "stretch" }}
      w="full"
      bg="white"
      borderRadius={{ base: "2xl", md: "3xl" }}
      px={{ base: 5, md: 9 }}
      py={{ base: 6, md: featured ? 8 : 6, lg: 5, xl: 0 }}
      h={{
        lg: "280px",
        xl: "300px",
      }}
      boxShadow="0 18px 42px rgba(15, 23, 42, 0.06)"
      overflow="hidden"
    >
      <Flex
        align="center"
        gap={{ base: 5, md: 8 }}
        gridColumn={{ base: "auto", lg: hasVisual ? "span 2" : "1 / -1" }}
        py={{ xl: featured ? 9 : 7 }}
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
          <Heading as="h3" color="teal.700" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.35">
            {title}
          </Heading>
          <Text color="gray.800" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" fontWeight="semibold">
            {body}
          </Text>
        </VStack>
      </Flex>

      {visual && <FeatureVisual type={visual} featured={featured} />}
    </SimpleGrid>
  );
};

const featureImageVisuals: Partial<Record<FeatureVisualType, string>> = {
  collect: featureCollectImage,
  notice: howtoNoticeImage,
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
      minH={{ base: featured ? "220px" : "170px", md: featured ? "240px" : "170px", lg: "100%" }}
      overflow="hidden"
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          w={{ base: "full", lg: "100%" }}
          h={{ lg: "100%" }}
          maxW={{ base: "300px", md: "340px", lg: "none" }}
          maxH={{ base: featured ? "220px" : "170px", md: featured ? "240px" : "170px", lg: "none" }}
          objectFit="contain"
          loading="lazy"
        />
      )}
      {type === "shift" && <ShiftVisual />}
    </Flex>
  );
};

const ShiftVisual = () => (
  <Box position="relative" w="full" maxW={{ base: "360px", md: "520px" }} mx="auto">
    <Image src={shiftFormImage} alt="シフト表を作る画面イメージ" w="full" objectFit="contain" loading="lazy" />
  </Box>
);
