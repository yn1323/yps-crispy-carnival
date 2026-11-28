import { Box, Container, Flex, Heading, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import { LuChevronRight, LuExternalLink } from "react-icons/lu";
import relaxedStoreImage from "@/src/assets/illustrations/relaxed-store.webp";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { Button } from "@/src/components/ui/Button";
import type { ProductFeatureDemo } from "./productFeatureContent";
import { SentenceLines } from "./SentenceLines";

type SignupPosition = "hero" | "bottom";

export function FeatureSignupButton({ position }: { position: SignupPosition }) {
  return (
    <Button
      asChild
      colorPalette="teal"
      h={{ base: "56px", md: "60px" }}
      minW="220px"
      w={{ base: "full", md: "auto" }}
      px={8}
      borderRadius="md"
      fontWeight="bold"
      fontSize="md"
    >
      <MeasurementLink
        href="/signup"
        measurementCtaId={position === "hero" ? "feature_hero_signup" : "feature_bottom_signup"}
      >
        無料ではじめる
        <Icon as={LuChevronRight} boxSize={5} />
      </MeasurementLink>
    </Button>
  );
}

type DemoPosition = "hero" | "band";

/** 登録なしで操作できるデモを別タブで開く。登録の導線より目立たせないため、枠線のボタンにする。 */
export function FeatureDemoButton({ href, position }: { href: string; position: DemoPosition }) {
  return (
    <Button
      asChild
      colorPalette="teal"
      variant="outline"
      bg="white"
      h={{ base: "56px", md: "60px" }}
      minW="220px"
      w={{ base: "full", md: "auto" }}
      px={8}
      borderRadius="md"
      fontWeight="bold"
      fontSize="md"
    >
      <MeasurementLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="デモを試す（別タブで開きます）"
        measurementCtaId={position === "hero" ? "feature_hero_demo" : "feature_demo"}
      >
        デモを試す
        <Icon as={LuExternalLink} boxSize={4} aria-hidden />
      </MeasurementLink>
    </Button>
  );
}

/** 「できること」を読んだ人が、その場で操作を試せるようにする。 */
export function FeatureDemoBand({ demo }: { demo: ProductFeatureDemo }) {
  return (
    <Box as="section" bg="gray.50" py={{ base: 10, md: 12 }}>
      <Container maxW="4xl">
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "stretch", md: "center" }}
          justify="space-between"
          gap={{ base: 5, md: 8 }}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          p={{ base: 6, md: 8 }}
        >
          <Box>
            <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.5" letterSpacing="0">
              登録なしでデモを試せます
            </Heading>
            <Text mt={2} color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight="1.9">
              <SentenceLines text={demo.lead} />
            </Text>
          </Box>
          <FeatureDemoButton href={demo.href} position="band" />
        </Flex>
      </Container>
    </Box>
  );
}

/**
 * 機能ページの最後に置く登録導線。無料で試せる条件はTrialReassuranceだけで伝える。
 * 見出しとスマホでの順番（見出し、ボタン、イラスト）はTOPの末尾にそろえる。
 */
export function FeatureCtaBand() {
  return (
    <Box as="section" bg="#eaf8f6" py={{ base: 12, md: 16 }} overflow="hidden">
      <Container maxW="5xl">
        <Stack
          direction={{ base: "column", md: "row-reverse" }}
          align="center"
          justify="center"
          gap={{ base: 8, md: 10 }}
          textAlign={{ base: "center", md: "start" }}
        >
          <VStack align={{ base: "center", md: "start" }} gap={4} w={{ base: "full", md: "auto" }}>
            <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.5" letterSpacing="0">
              次のシフト募集は
              <Box as="span" display="block" color="teal.700">
                シフトリで始めよう
              </Box>
            </Heading>
            <FeatureSignupButton position="bottom" />
            <TrialReassurance />
          </VStack>
          <Image
            src={relaxedStoreImage}
            alt=""
            w={{ base: "260px", md: "360px" }}
            flexShrink={0}
            objectFit="contain"
            loading="lazy"
            decoding="async"
          />
        </Stack>
      </Container>
    </Box>
  );
}
