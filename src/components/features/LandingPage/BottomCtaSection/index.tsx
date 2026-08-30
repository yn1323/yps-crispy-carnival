import { Box, Container, Heading, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import { LuBookOpen, LuChevronRight } from "react-icons/lu";
import { MeasurementBoundaryLink } from "@/src/components/shared/MeasurementBoundaryLink";
import { Button } from "@/src/components/ui/Button";
import { TrialReassurance } from "../TrialReassurance";

export const BottomCtaSection = () => (
  <Box as="section" bg="#eaf8f6" py={14} overflow="hidden">
    <Container maxW="7xl">
      <VStack align="center" gap={6} textAlign="center">
        <Heading as="h2" fontSize={{ base: "xl", sm: "2xl", md: "3xl" }} lineHeight="1.35" letterSpacing="0">
          シフトのやり取りを
          <Box as="span" display="block" color="teal.700">
            LINEとメールでひとつに。
          </Box>
        </Heading>
        <Text color="gray.800" fontSize="md" lineHeight="1.9" fontWeight="semibold" maxW="620px">
          希望シフトを集めるところから、確定を知らせるところまで。
          <br />
          まずは2か月、実際の店舗とスタッフで試してみませんか。
        </Text>
        <VStack align="center" gap={3} w={{ base: "full", md: "auto" }}>
          <Stack direction={{ base: "column", md: "row" }} gap={4} w={{ base: "full", md: "auto" }}>
            <BottomButton href="/signup" label="シフトリをはじめる" primary />
            <BottomButton href="/help" label="基本の使い方を見る" />
          </Stack>
          <TrialReassurance />
        </VStack>
      </VStack>
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
    <MeasurementBoundaryLink href={href} measurementCtaId={primary ? "bottom_signup" : "bottom_help"}>
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
    </MeasurementBoundaryLink>
  </Button>
);
