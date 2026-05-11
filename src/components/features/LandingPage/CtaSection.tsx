import {
  Box,
  Button,
  type ButtonProps,
  Container,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import { LuChevronRight, LuClock, LuMonitor, LuMonitorPlay, LuSmartphone, LuUserPlus } from "react-icons/lu";

const benefits = [
  { icon: LuClock, label: "1分で登録" },
  { icon: LuSmartphone, label: "専用アプリ不要" },
  { icon: LuMonitor, label: "デモを試せる" },
];

export const CtaSection = () => (
  <Box as="section" id="cta" bg="white" py={{ base: 16, md: 24 }}>
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
            <Heading
              as="h2"
              fontSize={{ base: "2xl", md: "4xl", xl: "5xl" }}
              lineHeight={{ base: "2rem", md: "3rem", xl: "3.75rem" }}
            >
              まずは無料で試せます
            </Heading>
            <Text maxW="720px" color="whiteAlpha.950" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
              希望回収からシフト作成・共有まで、シフトリの使いやすさをそのままお試しください。
            </Text>
          </VStack>

          <Box w="full" maxW="1080px" borderTopWidth="1px" borderTopColor="whiteAlpha.400" pt={{ base: 6, md: 8 }}>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 4, md: 6 }}>
              <CtaButton icon={LuUserPlus} label="無料ではじめる" tone="primary" to="/signup" />
              <CtaButton
                icon={LuMonitorPlay}
                label="登録なしでデモを試す"
                tone="secondary"
                href="/demo/shiftboard"
                external
              />
            </SimpleGrid>
          </Box>

          <SimpleGrid columns={{ base: 1, lg: 3 }} gap={{ base: 0, lg: 8 }} w="full" maxW="980px">
            {benefits.map((benefit) => (
              <BenefitItem key={benefit.label} icon={benefit.icon} label={benefit.label} />
            ))}
          </SimpleGrid>

          <Text maxW="640px" color="whiteAlpha.900" textStyle="bodySm" lineHeight="1.8">
            現在は正式リリースに向けて準備中です。料金プランは今後ご案内します。
          </Text>
        </VStack>
      </Box>
    </Container>
  </Box>
);

type CtaButtonProps = {
  icon: IconType;
  label: string;
  tone: "primary" | "secondary";
  to?: "/signup";
  href?: string;
  external?: boolean;
} & ButtonProps;

const CtaButton = ({ icon, label, tone, to, href, external, ...buttonProps }: CtaButtonProps) => {
  const isPrimary = tone === "primary";
  const content = (
    <>
      <Icon as={icon} boxSize={{ base: 6, md: 7 }} justifySelf="center" />
      <Text as="span" minW={0} textAlign="center" whiteSpace={{ base: "normal", md: "nowrap" }}>
        {label}
      </Text>
      <Icon as={LuChevronRight} boxSize={{ base: 5, md: 6 }} justifySelf="center" />
    </>
  );

  return (
    <Button
      asChild={!!to || !!href}
      type="button"
      display="grid"
      gridTemplateColumns="28px minmax(0, 1fr) 28px"
      columnGap={{ base: 3, md: 5 }}
      h={{ base: "56px", md: "64px" }}
      w="full"
      px={{ base: 5, md: 7 }}
      color={isPrimary ? "teal.700" : "white"}
      bg={isPrimary ? "white" : "transparent"}
      borderWidth="2px"
      borderColor="white"
      borderRadius="full"
      textStyle={{ base: "md", md: "md" }}
      fontWeight="bold"
      lineHeight="1.4"
      whiteSpace="normal"
      _hover={{ bg: isPrimary ? "teal.50" : "whiteAlpha.200" }}
      _active={{ bg: isPrimary ? "teal.100" : "whiteAlpha.300" }}
      {...buttonProps}
    >
      {to ? (
        <RouterLink to={to} search={{ redirect: undefined }}>
          {content}
        </RouterLink>
      ) : href ? (
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {content}
        </a>
      ) : (
        content
      )}
    </Button>
  );
};

const BenefitItem = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex
    align="center"
    justify={{ base: "start", lg: "center" }}
    gap={{ base: 4, lg: 5 }}
    borderTopWidth={{ base: "1px", lg: "0" }}
    borderLeftWidth={{ base: "0", lg: "1px" }}
    borderColor="whiteAlpha.400"
    px={{ base: 0, lg: 6 }}
    py={{ base: 5, lg: 0 }}
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
    <Text textStyle={{ base: "md", md: "md" }} fontWeight="bold" lineHeight="1.5">
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
      inset={0}
      opacity={0.18}
      bgImage="radial-gradient(circle, rgba(255, 255, 255, 0.95) 1.5px, transparent 1.5px)"
      bgSize="22px 22px"
      maskImage="linear-gradient(135deg, black 0%, transparent 34%, transparent 68%, black 100%)"
    />
  </>
);
