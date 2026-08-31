import { Box, Flex, Grid, Icon, Link, Text, VisuallyHidden } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { resolveAppNavigationTarget } from "../appNavigationTargetResolver";
import type { AppNavigationKey, AppPrimaryNavigationItem } from "./navigation";
import { APP_PRIMARY_NAVIGATION_ITEMS } from "./navigation";

export const MOBILE_APP_NAVIGATION_HEIGHT = "56px";

const GLASS_BACKDROP_FILTER = "blur(12px) saturate(135%)";

type Props = {
  activeKey: AppNavigationKey | null;
  activeOrganizationId?: string | null;
};

export function DesktopAppPrimaryNavigation({ activeKey, activeOrganizationId }: Props) {
  return (
    <Flex
      as="nav"
      aria-label="メインメニュー"
      display={{ base: "none", lg: "flex" }}
      align="center"
      justify="center"
      gap={1}
      minW={0}
      w="full"
    >
      {APP_PRIMARY_NAVIGATION_ITEMS.map((item) => (
        <DesktopNavigationLink
          key={item.key}
          item={item}
          isActive={activeKey === item.key}
          activeOrganizationId={activeOrganizationId}
        />
      ))}
    </Flex>
  );
}

export function MobileAppPrimaryNavigation({ activeKey, activeOrganizationId }: Props) {
  return (
    <Box
      as="nav"
      aria-label="メインメニュー"
      display={{ base: "block", lg: "none" }}
      position="fixed"
      insetX={0}
      bottom={0}
      zIndex="sticky"
      bg="rgba(255, 255, 255, 0.82)"
      borderTopWidth="1px"
      borderColor="rgba(15, 23, 42, 0.08)"
      backdropFilter={GLASS_BACKDROP_FILTER}
      css={{ WebkitBackdropFilter: GLASS_BACKDROP_FILTER }}
      pb="env(safe-area-inset-bottom)"
    >
      <Grid templateColumns="repeat(5, minmax(0, 1fr))" w="full">
        {APP_PRIMARY_NAVIGATION_ITEMS.map((item) => (
          <MobileNavigationLink
            key={item.key}
            item={item}
            isActive={activeKey === item.key}
            activeOrganizationId={activeOrganizationId}
          />
        ))}
      </Grid>
    </Box>
  );
}

type NavigationLinkProps = {
  item: AppPrimaryNavigationItem;
  isActive: boolean;
  activeOrganizationId?: string | null;
};

function DesktopNavigationLink({ item, isActive, activeOrganizationId }: NavigationLinkProps) {
  const target = resolveAppNavigationTarget(item.href, activeOrganizationId);

  return (
    <Link
      asChild
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap={1.5}
      minH="44px"
      minW={0}
      px={{ lg: 2, xl: 3 }}
      color={isActive ? "teal.700" : "gray.700"}
      borderBottomWidth="3px"
      borderColor={isActive ? "teal.600" : "transparent"}
      fontSize="sm"
      fontWeight={isActive ? "bold" : "semibold"}
      whiteSpace="nowrap"
      focusRing="none"
      transitionProperty="colors"
      transitionDuration="faster"
      _hover={{ color: "teal.800", bg: "gray.50", textDecoration: "none" }}
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
    >
      <RouterLink to={target.to} search={target.search} aria-current={isActive ? "page" : undefined}>
        <NavigationIcon item={item} size="20px" />
        <Text as="span">{item.label}</Text>
        {item.badge && <VisuallyHidden>、{item.badge.label}</VisuallyHidden>}
      </RouterLink>
    </Link>
  );
}

function MobileNavigationLink({ item, isActive, activeOrganizationId }: NavigationLinkProps) {
  const target = resolveAppNavigationTarget(item.href, activeOrganizationId);

  return (
    <Link
      asChild
      position="relative"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={0.5}
      minH={MOBILE_APP_NAVIGATION_HEIGHT}
      minW="44px"
      px={1}
      color={isActive ? "teal.700" : "gray.700"}
      fontSize="2xs"
      fontWeight={isActive ? "bold" : "semibold"}
      lineHeight="short"
      focusRing="none"
      transitionProperty="colors"
      transitionDuration="faster"
      _hover={{ bg: "gray.50", color: isActive ? "teal.800" : "gray.900", textDecoration: "none" }}
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
    >
      <RouterLink to={target.to} search={target.search} aria-current={isActive ? "page" : undefined}>
        {isActive && (
          <Box aria-hidden position="absolute" top={0} insetX="18%" h="3px" bg="teal.600" borderBottomRadius="full" />
        )}
        <NavigationIcon item={item} size="24px" />
        <Text as="span" whiteSpace="nowrap">
          {item.label}
        </Text>
        {item.badge && <VisuallyHidden>、{item.badge.label}</VisuallyHidden>}
      </RouterLink>
    </Link>
  );
}

function NavigationIcon({ item, size }: { item: AppPrimaryNavigationItem; size: string }) {
  return (
    <Box position="relative" display="inline-flex" boxSize={size} alignItems="center" justifyContent="center">
      <Icon as={item.icon} boxSize="full" aria-hidden />
      {item.badge && (
        <Flex
          aria-hidden
          position="absolute"
          top="-7px"
          right="-12px"
          minW="18px"
          h="18px"
          px={1}
          align="center"
          justify="center"
          borderRadius="full"
          bg="orange.600"
          color="white"
          fontSize="2xs"
          fontWeight="bold"
          lineHeight="1"
          boxShadow="0 0 0 2px white"
        >
          {item.badge.value}
        </Flex>
      )}
    </Box>
  );
}

export type { AppNavigationKey, AppPrimaryNavigationItem } from "./navigation";
export { APP_PRIMARY_NAVIGATION_ITEMS } from "./navigation";
