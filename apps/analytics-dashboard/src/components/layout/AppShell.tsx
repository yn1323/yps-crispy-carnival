import { Box, Container, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { type AppRoute, routePath, withCurrentSearch } from "@/routes/appRoute";

const NAV_ITEMS = [
  { label: "サマリー", route: { name: "overview" } as const },
  { label: "グループ", route: { name: "organizations" } as const },
  { label: "店舗", route: { name: "shops" } as const },
];

function activeNavigation(route: AppRoute) {
  if (route.name === "organization") return "organizations";
  if (route.name === "shop" || route.name === "cycle") return "shops";
  return route.name;
}

export function AppShell({ children, route }: { children: ReactNode; route: AppRoute }) {
  const active = activeNavigation(route);
  const { label: environmentLabel } = useAnalyticsEnvironment();
  return (
    <Box bg="gray.50" color="gray.950" minH="100vh">
      <Box as="header" bg="gray.950" color="white">
        <Container maxW="1440px" px={{ base: 4, md: 6 }}>
          <Flex align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={4} py={4}>
            <Stack flexShrink={0} gap={1}>
              <Text fontSize="lg" fontWeight="bold" letterSpacing="tight">
                シフトリ Analytics
              </Text>
              <HStack gap={2}>
                <Text color="gray.400" fontSize="xs">
                  内部BI
                </Text>
                <Text bg="whiteAlpha.200" borderRadius="sm" color="gray.300" fontSize="2xs" px={2} py={0.5}>
                  {environmentLabel ?? "接続先を確認中"}
                </Text>
              </HStack>
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
                <Box borderLeft="1px solid" borderColor="whiteAlpha.300" ml={3} pl={3}>
                  <Link
                    aria-current={active === "requests" ? "page" : undefined}
                    bg={active === "requests" ? "whiteAlpha.200" : "transparent"}
                    borderRadius="md"
                    color={active === "requests" ? "white" : "gray.300"}
                    fontSize="sm"
                    fontWeight="bold"
                    href={routePath({ name: "requests" })}
                    px={4}
                    py={2.5}
                    textDecoration="none"
                    _hover={{ bg: "whiteAlpha.200", color: "white", textDecoration: "none" }}
                  >
                    要望
                  </Link>
                </Box>
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
