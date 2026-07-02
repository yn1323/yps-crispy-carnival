import { Box, Container, Heading, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import { LuChevronRight, LuMousePointerClick } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

export const BottomCtaSection = () => (
  <Box as="section" bg="#eaf8f6" py={14} overflow="hidden">
    <Container maxW="7xl">
      <VStack align="start" gap={6}>
        <Heading as="h2" fontSize={{ base: "xl", sm: "2xl", md: "3xl" }} lineHeight="1.35" letterSpacing="0">
          シフトのやり取りを
          <Box as="span" display="block" color="teal.700">
            LINEとメールでひとつに。
          </Box>
        </Heading>
        <Text color="gray.800" fontSize="md" lineHeight="1.9" fontWeight="semibold" maxW="620px">
          希望シフトを集めるところから、確定を知らせるところまで。まずは無料で、毎月のシフト連絡をラクにしませんか。
        </Text>
        <Stack direction={{ base: "column", md: "row" }} gap={4} w={{ base: "full", md: "auto" }}>
          <BottomButton href="/signup" label="無料で試してみる" primary />
          <BottomButton href="/demo/flow" label="登録不要でデモを見る" />
        </Stack>
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
    <a href={href}>
      {primary ? <Icon as={LuChevronRight} boxSize={5} /> : <Icon as={LuMousePointerClick} boxSize={5} />}
      {label}
    </a>
  </Button>
);
