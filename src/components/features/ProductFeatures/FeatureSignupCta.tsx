import { Box, Container, Heading, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import relaxedStoreImage from "@/src/assets/illustrations/relaxed-store.png";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { Button } from "@/src/components/ui/Button";

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

/** 機能ページの最後に置く登録導線。ページごとの説明は本文で済ませ、ここでは試し方だけを伝える。 */
export function FeatureCtaBand() {
  return (
    <Box as="section" bg="#eaf8f6" py={{ base: 12, md: 16 }} overflow="hidden">
      <Container maxW="5xl">
        <Stack
          direction={{ base: "column", md: "row" }}
          align="center"
          justify="center"
          gap={{ base: 6, md: 10 }}
          textAlign={{ base: "center", md: "start" }}
        >
          <Image
            src={relaxedStoreImage}
            alt=""
            w={{ base: "260px", md: "360px" }}
            flexShrink={0}
            objectFit="contain"
            loading="lazy"
            decoding="async"
          />
          <VStack align={{ base: "center", md: "start" }} gap={4}>
            <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.5" letterSpacing="0">
              次のシフト募集からシフトリで
            </Heading>
            <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight="1.8" fontWeight="semibold">
              登録から2か月は、すべての機能を無料で試せます。
            </Text>
            <FeatureSignupButton position="bottom" />
            <TrialReassurance />
          </VStack>
        </Stack>
      </Container>
    </Box>
  );
}
