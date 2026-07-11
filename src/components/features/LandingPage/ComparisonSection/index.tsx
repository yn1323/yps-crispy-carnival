import { Box, Container, Image, VStack } from "@chakra-ui/react";
import { SectionHeading } from "../SectionHeading";
import comparisonImage from "./comparison.webp";
import comparisonImageSp from "./comparison-sp.webp";

export const ComparisonSection = () => (
  <Box as="section" bg="white" py={14}>
    <Container maxW="7xl">
      <VStack gap={7}>
        <SectionHeading phrases={["紙・Excel・LINEグループの", "シフト管理を、ひとつに。"]} textAlign="center" />

        <ComparisonImages />
      </VStack>
    </Container>
  </Box>
);

const ComparisonImages = () => (
  <Box w="full">
    <Image
      src={comparisonImage}
      alt="紙・口頭・LINEで行う従来のシフト管理と、シフトリによる希望回収・自動リマインド・調整・共有の比較"
      display="block"
      hideBelow="md"
      w="full"
    />
    <Image
      src={comparisonImageSp}
      alt="紙・口頭・LINEで行う従来のシフト管理と、シフトリによる希望回収・自動リマインド・調整・共有の比較"
      display="block"
      hideFrom="md"
      w="full"
    />
  </Box>
);
