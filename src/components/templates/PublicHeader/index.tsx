import { Box, Container, Flex, Image, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@/src/components/ui/Button";

const navItems = [
  { label: "シフトリでできること", href: "#features" },
  { label: "よくある質問", href: "#faq" },
];

type PublicHeaderProps = {
  showLinks?: boolean;
  showLogin?: boolean;
  compact?: boolean;
};

export const PublicHeader = ({ showLinks = true, showLogin = true, compact = false }: PublicHeaderProps) => (
  <Box as="header" position="fixed" insetX={0} top={0} zIndex="sticky" bg="#dff1ff">
    <Container
      maxW="7xl"
      py={{ base: compact ? 2 : 3, md: compact ? 2 : 4 }}
      minH={{ base: compact ? "48px" : "66px", md: compact ? "48px" : "80px" }}
      display="flex"
      alignItems="center"
    >
      <Flex align="center" justify="space-between" gap={6} w="full">
        <PublicHeaderBrand compact={compact} />

        {(showLinks || showLogin) && (
          <Flex display={{ base: "none", md: "flex" }} align="center" gap={{ md: 7, lg: 9 }}>
            {showLinks &&
              navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  color="gray.950"
                  textStyle="sm"
                  fontWeight="bold"
                  _hover={{ color: "teal.700", textDecoration: "none" }}
                >
                  {item.label}
                </Link>
              ))}
            {showLogin && (
              <Flex align="center" gap={3}>
                <Button
                  asChild
                  type="button"
                  variant="solid"
                  colorPalette="teal"
                  h="48px"
                  px={6}
                  borderRadius="full"
                  fontWeight="bold"
                >
                  <RouterLink to="/login" search={{ redirect: undefined }}>
                    ログイン
                  </RouterLink>
                </Button>
              </Flex>
            )}
          </Flex>
        )}

        {showLogin && (
          <Button
            asChild
            type="button"
            display={{ base: "inline-flex", md: "none" }}
            variant="solid"
            colorPalette="teal"
            h="42px"
            px={5}
            borderRadius="full"
            fontWeight="bold"
          >
            <RouterLink to="/login" search={{ redirect: undefined }}>
              ログイン
            </RouterLink>
          </Button>
        )}
      </Flex>
    </Container>
  </Box>
);

const PublicHeaderBrand = ({ compact }: { compact: boolean }) => (
  <Link href="/" _hover={{ opacity: 0.8, textDecoration: "none" }}>
    <Flex align="center" gap={3}>
      <Image
        src="/logo192.webp"
        alt="シフトリ"
        boxSize={{ base: compact ? 8 : 9, md: compact ? 8 : 10 }}
        objectFit="contain"
      />
      <Text color="gray.950" fontSize={{ base: compact ? "lg" : "xl", md: compact ? "xl" : "2xl" }} fontWeight="bold">
        シフトリ
      </Text>
    </Flex>
  </Link>
);
