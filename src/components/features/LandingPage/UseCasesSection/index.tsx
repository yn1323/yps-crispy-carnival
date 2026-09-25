import { Box, Container, Flex, Image, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";
import careImage from "./store-care.png";
import eventImage from "./store-event.png";
import restaurantImage from "./store-restaurant.png";
import retailImage from "./store-retail.png";
import salonImage from "./store-salon.png";

// 導入実績ではなく、提出方法とお店の働き方の相性として書く。
const industries: Array<{ imageSrc: string; label: string; body: string }> = [
  {
    imageSrc: restaurantImage,
    label: "飲食店・カフェ",
    body: "おすすめ：時間指定",
  },
  {
    imageSrc: retailImage,
    label: "小売店",
    body: "おすすめ：時間指定",
  },
  {
    imageSrc: salonImage,
    label: "美容室・サロン",
    body: "おすすめ：日付選択",
  },
  {
    imageSrc: careImage,
    label: "介護・施設",
    body: "おすすめ：パターン選択",
  },
  {
    imageSrc: eventImage,
    label: "イベント運営",
    body: "おすすめ：日付選択",
  },
];

export const UseCasesSection = () => (
  <Box
    as="section"
    id="use-cases"
    bg="#fbfefe"
    py={{ base: 14, md: 18 }}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <VStack gap={3} textAlign="center">
        <SectionHeading phrases={["いろいろなお店の", "シフトに使えます"]} textAlign="center" />
        <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.8">
          お店の働き方に合う提出方法を選べます
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} gap={4} mt={{ base: 8, md: 10 }}>
        {industries.map((industry) => (
          <Flex
            key={industry.label}
            direction={{ base: "row", lg: "column" }}
            align={{ base: "center", lg: "stretch" }}
            gap={{ base: 4, lg: 3 }}
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="xl"
            p={{ base: 4, lg: 5 }}
          >
            <Flex
              align="center"
              justify="center"
              flexShrink={0}
              w={{ base: "96px", lg: "full" }}
              h={{ base: "88px", lg: "120px" }}
            >
              <Image
                src={industry.imageSrc}
                alt=""
                maxW="full"
                maxH="full"
                objectFit="contain"
                loading="lazy"
                decoding="async"
              />
            </Flex>
            <Box minW={0} textAlign={{ base: "start", lg: "center" }}>
              <Text as="h3" color="gray.950" fontSize="md" fontWeight="bold" lineHeight="1.5">
                {industry.label}
              </Text>
              <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.7">
                {industry.body}
              </Text>
            </Box>
          </Flex>
        ))}
      </SimpleGrid>
    </Container>
  </Box>
);
