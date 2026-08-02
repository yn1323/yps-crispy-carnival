import { Box, Container, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { type AppRoute, routePath, withCurrentSearch } from "@/routes/appRoute";

const NAV_ITEMS = [
  { label: "全体", route: { name: "overview" } as const },
  { label: "グループ", route: { name: "organizations" } as const },
  { label: "店舗", route: { name: "shops" } as const },
  { label: "要望", route: { name: "requests" } as const },
];

function activeNavigation(route: AppRoute) {
  if (route.name === "organization") return "organizations";
  if (route.name === "shop" || route.name === "cycle") return "shops";
  return route.name;
}

export function AppShell({ children, route }: { children: ReactNode; route: AppRoute }) {
  const active = activeNavigation(route);
  return (
    <Box bg="gray.50" color="gray.950" minH="100vh">
      <Box as="header" bg="gray.950" color="white">
        <Container maxW="1440px" px={{ base: 4, md: 6 }}>
          <Flex align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} py={4}>
            <Stack flexShrink={0} gap={0}>
              <Text fontSize="lg" fontWeight="bold" letterSpacing="tight">
                シフトリ Analytics
              </Text>
              <Text color="gray.400" fontSize="xs">
                内部BI
              </Text>
            </Stack>
            <Box flex="1" maxW="full" overflowX="auto">
              <HStack as="nav" aria-label="分析画面" gap={1} minW="max-content">
                {NAV_ITEMS.map((item) => {
                  const isActive = active === item.route.name;
                  return (
                    <Link
                      key={item.route.name}
                      aria-current={isActive ? "page" : undefined}
                      bg={isActive ? "whiteAlpha.200" : "transparent"}
                      borderRadius="md"
                      color={isActive ? "white" : "gray.300"}
                      fontSize="sm"
                      fontWeight="bold"
                      href={withCurrentSearch(routePath(item.route), { dropSort: true })}
                      px={4}
                      py={2.5}
                      textDecoration="none"
                      _hover={{ bg: "whiteAlpha.200", color: "white", textDecoration: "none" }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </HStack>
            </Box>
          </Flex>
        </Container>
      </Box>
      <Container as="main" maxW="1440px" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }}>
        {children}
      </Container>
    </Box>
  );
}
