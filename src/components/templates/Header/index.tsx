import { Box, Flex, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";

export const Header = () => {
  return (
    <Box as="header" position="fixed" top={0} left={0} right={0} h="56px" bg="teal.600" zIndex={20}>
      <Flex maxW="1024px" mx="auto" h="full" px={4} align="center" justify="space-between">
        <Link to="/dashboard">
          <Text color="white" fontWeight="semibold" _hover={{ opacity: 0.8 }} cursor="pointer">
            シフトリ
          </Text>
        </Link>

        <UserMenu />
      </Flex>
    </Box>
  );
};
