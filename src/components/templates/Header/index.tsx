import { Box, Flex, Image, Link } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";

export const Header = () => {
  return (
    <Box as="header" position="fixed" top={0} left={0} right={0} h="56px" bg="teal.600" zIndex={20}>
      <Flex w="full" h="full" px={4} align="center" justify="space-between">
        <Link asChild _hover={{ opacity: 0.8, textDecoration: "none" }}>
          <RouterLink to="/dashboard">
            <Image src="/textlogo.webp" alt="シフトリ" h="40px" w="auto" loading="eager" />
          </RouterLink>
        </Link>

        <UserMenu />
      </Flex>
    </Box>
  );
};
