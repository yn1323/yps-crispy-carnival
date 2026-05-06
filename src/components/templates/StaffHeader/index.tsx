import { Box, Flex, Image, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";

export const STAFF_CONTENT_MAX_W = "1024px";
export const STAFF_PAGE_PX = { base: 4, lg: 6 } as const;

type Props = {
  shopName: string;
};

export const StaffHeaderBrand = ({ shopName }: Props) => {
  return (
    <Flex align="center" justify="space-between" gap={4} minW={0} w="full">
      <Text
        color="white"
        fontWeight="bold"
        fontSize={{ base: "md", lg: "lg" }}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        minW={0}
        flex={1}
      >
        {shopName}
      </Text>
      <Flex align="center" gap={{ base: 1.5, lg: 2 }} flexShrink={0}>
        <Text color="whiteAlpha.800" fontSize={{ base: "2xs", lg: "xs" }} fontWeight="semibold" whiteSpace="nowrap">
          Powered by
        </Text>
        <Link asChild _hover={{ opacity: 0.85, textDecoration: "none" }}>
          <RouterLink to="/" aria-label="シフトリのトップページへ">
            <Image
              src="/textlogo.webp"
              alt="シフトリ"
              h={{ base: "22px", lg: "26px" }}
              w="auto"
              loading="eager"
              flexShrink={0}
            />
          </RouterLink>
        </Link>
      </Flex>
    </Flex>
  );
};

export const StaffHeader = ({ shopName }: Props) => {
  return (
    <Box
      as="header"
      position="fixed"
      top={0}
      left={0}
      right={0}
      h={{ base: "48px", lg: "56px" }}
      bg="teal.600"
      zIndex={20}
    >
      <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" h="full" px={STAFF_PAGE_PX} align="center">
        <StaffHeaderBrand shopName={shopName} />
      </Flex>
    </Box>
  );
};
