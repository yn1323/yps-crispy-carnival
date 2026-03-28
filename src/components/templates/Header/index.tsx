import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { LuLogOut } from "react-icons/lu";

export const Header = () => {
  return (
    <Box as="header" position="fixed" top={0} left={0} right={0} h="56px" bg="teal.600" zIndex={10}>
      <Flex maxW="1024px" mx="auto" h="full" px={4} align="center" justify="space-between">
        <Text color="white" fontWeight="semibold">
          シフト管理
        </Text>

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
