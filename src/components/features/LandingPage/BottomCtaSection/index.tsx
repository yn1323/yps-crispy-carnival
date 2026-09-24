import { Box, Container, Grid, Heading, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import { LuBookOpen, LuChevronRight } from "react-icons/lu";
import relaxedStoreImage from "@/src/assets/illustrations/relaxed-store.png";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { Button } from "@/src/components/ui/Button";

export const BottomCtaSection = () => (
  <Box as="section" bg="#eaf8f6" py={{ base: 14, md: 16 }} overflow="hidden">
    <Container maxW="6xl">
      <Grid
        templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 1.05fr) minmax(0, 0.95fr)" }}
        gap={{ base: 8, lg: 10 }}
        alignItems="center"
      >
        <VStack align={{ base: "center", lg: "start" }} gap={6} textAlign={{ base: "center", lg: "start" }}>
          <VStack align={{ base: "center", lg: "start" }} gap={3}>
            <Heading as="h2" fontSize={{ base: "xl", sm: "2xl", md: "3xl" }} lineHeight="1.35" letterSpacing="0">
              次のシフト募集は
              <Box as="span" display="block" color="teal.700">
                シフトリで始めよう
              </Box>
            </Heading>
            <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.8">
              登録から2か月は、すべての機能を無料で試せます。
            </Text>
          </VStack>
          <VStack align={{ base: "center", lg: "start" }} gap={3} w={{ base: "full", md: "auto" }}>
            <Stack direction={{ base: "column", md: "row" }} gap={4} w={{ base: "full", md: "auto" }}>
              <BottomButton href="/signup" label="無料ではじめる" primary />
              <BottomButton href="/help/scenarios/shift-management" label="基本の使い方を見る" />
            </Stack>
            <TrialReassurance />
          </VStack>
        </VStack>

        <Image
          src={relaxedStoreImage}
          alt="営業前の店内で、店長がコーヒーを飲み、スタッフがスマートフォンでシフトを確認しているイラスト"
          w="full"
          maxW={{ base: "440px", lg: "none" }}
          mx="auto"
          aspectRatio={3 / 2}
          objectFit="contain"
          loading="lazy"
          decoding="async"
        />
      </Grid>
    </Container>
  </Box>
);

const BottomButton = ({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) => (
  <Button
    asChild
    colorPalette="teal"
    variant={primary ? "solid" : "outline"}
    bg={primary ? undefined : "white"}
    h="52px"
    minW="220px"
    w={{ base: "full", md: "auto" }}
    px={7}
    borderRadius="md"
    fontWeight="bold"
  >
    <MeasurementLink href={href} measurementCtaId={primary ? "bottom_signup" : "bottom_help"}>
      {primary ? (
        <>
          {label}
          <Icon as={LuChevronRight} boxSize={5} />
        </>
      ) : (
        <>
          <Icon as={LuBookOpen} boxSize={5} />
          {label}
        </>
      )}
    </MeasurementLink>
  </Button>
);
