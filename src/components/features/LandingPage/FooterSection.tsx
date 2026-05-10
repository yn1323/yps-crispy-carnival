import { Box, Flex, HStack, Image, Link, Text, VStack } from "@chakra-ui/react";

type FooterColLink = { label: string; href: string };

const productLinks: FooterColLink[] = [
  { label: "無料デモ", href: "/demo/shiftboard" },
  { label: "できること", href: "/features" },
];

const supportLinks: FooterColLink[] = [{ label: "よくある質問", href: "/faq" }];

const companyLinks: FooterColLink[] = [
  { label: "利用規約", href: "/terms" },
  { label: "プライバシー", href: "/privacy" },
];

export const FooterSection = () => (
  <Box as="footer" bg="teal.600" color="white" px={{ base: 5, lg: 6 }} pt={16} pb={10}>
    <Box
      mx="auto"
      maxW="1024px"
      display="grid"
      gridTemplateColumns={{ base: "1fr 1fr", lg: "1.2fr 1fr 1fr 1fr" }}
      gap={{ base: 8, lg: 12 }}
    >
      <VStack align="start" gap={3} gridColumn={{ base: "1 / -1", lg: "auto" }}>
        <Link href="/" _hover={{ opacity: 0.8, textDecoration: "none" }}>
          <HStack gap={2.5} fontWeight="bold" textStyle="lg" color="white">
            <Image src="/logo512.png" alt="" boxSize="28px" borderRadius="full" bg="whiteAlpha.300" p="3px" />
            <Box as="span">シフトリ</Box>
          </HStack>
        </Link>
        <Text textStyle="bodySm" opacity={0.85} lineHeight={1.7} maxW="260px">
          シフト作成をもっとラクに
        </Text>
      </VStack>

      <FooterCol title="Product" links={productLinks} />
      <FooterCol title="Support" links={supportLinks} />
      <FooterCol title="Company" links={companyLinks} />
    </Box>

    <Flex
      mx="auto"
      maxW="1024px"
      mt={10}
      pt={6}
      borderTopWidth="1px"
      borderColor="whiteAlpha.300"
      textStyle="caption"
      opacity={0.7}
      justify="center"
      flexWrap="wrap"
      gap={2}
    >
      <Box as="span">
        © {new Date().getFullYear()} シフトリ v{__APP_VERSION__}
      </Box>
    </Flex>
  </Box>
);

const FooterCol = ({ title, links }: { title: string; links: FooterColLink[] }) => (
  <VStack align="start" gap={2.5}>
    <Text textStyle="label" fontWeight="bold" opacity={0.7} letterSpacing="0.08em" textTransform="uppercase" mb={1}>
      {title}
    </Text>
    {links.map(({ label, href }) => (
      <Link key={label} href={href} color="white" textStyle="sm" _hover={{ opacity: 0.75, textDecoration: "none" }}>
        {label}
      </Link>
    ))}
  </VStack>
);
