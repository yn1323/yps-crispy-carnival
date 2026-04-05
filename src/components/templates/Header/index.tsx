import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { LuLogOut } from "react-icons/lu";

export const Header = () => {
  return (
    <Box as="header" position="fixed" top={0} left={0} right={0} h="56px" bg="teal.600" zIndex={20}>
      <Flex maxW="1024px" mx="auto" h="full" px={4} align="center" justify="space-between">
        <Link to="/dashboard">
          <Text color="white" fontWeight="semibold" _hover={{ opacity: 0.8 }} cursor="pointer">
            シフト管理
          </Text>
        </Link>

        <SignOutButton>
          <Button variant="ghost" size="sm" color="white" _hover={{ bg: "teal.500" }}>
            <LuLogOut />
            ログアウト
          </Button>
        </SignOutButton>
      </Flex>
    </Box>
  );
};
