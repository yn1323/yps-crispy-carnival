import { Box, Button, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuChevronRight, LuClock, LuEye, LuMonitor, LuSmartphone, LuUserPlus } from "react-icons/lu";

const benefits = [
  { icon: LuClock, label: "登録は\n1分で完了" },
  { icon: LuSmartphone, label: "スタッフは\n専用アプリ不要" },
  { icon: LuMonitor, label: "デモは\n登録不要" },
];

export const CtaSection = () => (
  <Box as="section" bg="white" py={{ base: 16, md: 24 }}>
    <Container maxW="7xl">
      <Box
        position="relative"
        overflow="hidden"
        bg="teal.700"
        color="white"
        borderRadius={{ base: "2xl", md: "3xl" }}
        px={{ base: 6, md: 16 }}
        py={{ base: 10, md: 20 }}
      >
        <Decorations />

        <VStack position="relative" zIndex={1} gap={{ base: 7, md: 10 }} textAlign="center">
          <VStack gap={{ base: 4, md: 6 }}>
            <Text color="yellow.100" textStyle={{ base: "label", md: "2xl" }} fontWeight="bold">
              正式リリース前のいまだけ
            </Text>
            <Heading as="h2" textStyle="heroTitle" lineHeight="1.25">
              全機能を無料で使えます。
            </Heading>
            <Text maxW="860px" color="whiteAlpha.950" textStyle={{ base: "body", md: "lg" }} lineHeight="1.8">
              シフト希望の回収から、シフト表の作成・共有まで。
              <Box as="span" display={{ base: "inline", md: "block" }}>
                まずは無料でシフトリの使いやすさを試してみてください。
              </Box>
            </Text>
          </VStack>

          <Box w="full" maxW="1080px" borderTopWidth="1px" borderTopColor="whiteAlpha.400" pt={{ base: 6, md: 8 }}>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 4, md: 6 }}>
              <CtaButton icon={LuUserPlus} label="無料ではじめる" tone="primary" />
              <CtaButton icon={LuEye} label="登録なしでデモを見る" tone="secondary" />
            </SimpleGrid>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 0, md: 8 }} w="full" maxW="980px">
            {benefits.map((benefit) => (
              <BenefitItem key={benefit.label} icon={benefit.icon} label={benefit.label} />
            ))}
          </SimpleGrid>

          <Text maxW="780px" color="whiteAlpha.900" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.9">
            現在は正式リリースに向けて準備中のため、すべての機能を無料でお使いいただけます。
            <Box as="span" display="block">
              正式な料金プランは今後ご案内予定です。
            </Box>
          </Text>
        </VStack>
      </Box>
    </Container>
  </Box>
);

const CtaButton = ({ icon, label, tone }: { icon: IconType; label: string; tone: "primary" | "secondary" }) => {
  const isPrimary = tone === "primary";

  return (
    <Button
      type="button"
      h={{ base: "64px", md: "76px" }}
      w="full"
      justifyContent="space-between"
      px={{ base: 5, md: 7 }}
      color={isPrimary ? "teal.700" : "white"}
      bg={isPrimary ? "white" : "transparent"}
      borderWidth="2px"
      borderColor="white"
      borderRadius="full"
      textStyle="lg"
      fontWeight="bold"
      lineHeight="1.4"
      whiteSpace="normal"
      _hover={{ bg: isPrimary ? "teal.50" : "whiteAlpha.200" }}
      _active={{ bg: isPrimary ? "teal.100" : "whiteAlpha.300" }}
    >
      <Flex align="center" gap={{ base: 3, md: 5 }}>
        <Icon as={icon} boxSize={{ base: 6, md: 7 }} />
        <Text as="span">{label}</Text>
      </Flex>
      <Icon as={LuChevronRight} boxSize={{ base: 5, md: 6 }} />
    </Button>
  );
};

const BenefitItem = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex
    align="center"
    justify={{ base: "start", md: "center" }}
    gap={{ base: 4, md: 5 }}
    borderTopWidth={{ base: "1px", md: "0" }}
    borderLeftWidth={{ base: "0", md: "1px" }}
    borderColor="whiteAlpha.400"
    px={{ base: 0, md: 6 }}
    py={{ base: 5, md: 0 }}
    _first={{ borderTopWidth: "0", borderLeftWidth: "0" }}
  >
    <Flex
      align="center"
      justify="center"
      flex="0 0 auto"
      boxSize={{ base: 12, md: 20 }}
      bg="whiteAlpha.200"
      borderRadius="full"
    >
      <Icon as={icon} boxSize={{ base: 7, md: 10 }} />
    </Flex>
    <Text textStyle={{ base: "md", md: "lg" }} fontWeight="bold" lineHeight="1.6" whiteSpace="pre-line">
      {label}
    </Text>
  </Flex>
);

const Decorations = () => (
  <>
    <Box
      position="absolute"
      inset={0}
      bg="linear-gradient(135deg, rgba(0, 99, 92, 0.95), rgba(0, 134, 119, 0.9) 48%, rgba(0, 92, 85, 0.98))"
    />
    <Box
      position="absolute"
      top="-120px"
      left="-120px"
      boxSize={{ base: "220px", md: "360px" }}
      borderRadius="full"
      bg="whiteAlpha.100"
    />
    <Box
      position="absolute"
      right="-110px"
      bottom="-110px"
      boxSize={{ base: "220px", md: "340px" }}
      borderRadius="full"
      bg="whiteAlpha.100"
    />
    <Box
      position="absolute"
      inset={0}
      opacity={0.18}
      bgImage="radial-gradient(circle, rgba(255, 255, 255, 0.95) 1.5px, transparent 1.5px)"
      bgSize="22px 22px"
      maskImage="linear-gradient(135deg, black 0%, transparent 34%, transparent 68%, black 100%)"
    />
  </>
);
