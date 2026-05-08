import { Box, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { useAtomValue } from "jotai";
import { LuChevronDown, LuLogOut, LuUserRound } from "react-icons/lu";
import { userAtom } from "@/src/stores/user";

export const UserMenu = () => {
  const user = useAtomValue(userAtom);
  const displayName = user.name || "ユーザー";

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <Box
          as="button"
          aria-label="ユーザーメニュー"
          cursor="pointer"
          _hover={{ opacity: 0.8 }}
          transition="opacity 0.15s"
          display="flex"
          alignItems="center"
          gap={2}
          minW={0}
        >
          <Flex
            boxSize={9}
            borderRadius="full"
            bg="white"
            color="teal.600"
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Icon as={LuUserRound} boxSize={6} />
          </Flex>
          <Text color="white" fontSize="sm" fontWeight="semibold" maxW={{ base: "96px", md: "160px" }} truncate>
            {displayName}
          </Text>
          <Icon as={LuChevronDown} boxSize={5} color="white" flexShrink={0} />
        </Box>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="200px">
            <Box px={3} py={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {displayName}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {user.email}
              </Text>
            </Box>
            <Menu.Separator />
            <SignOutButton>
              <Menu.Item value="logout" cursor="pointer" color="red.500">
                <LuLogOut />
                ログアウト
              </Menu.Item>
            </SignOutButton>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};
