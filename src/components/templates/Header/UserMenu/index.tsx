import { Box, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { useAtomValue } from "jotai";
import { LuLogOut, LuUserRound } from "react-icons/lu";
import { userAtom } from "@/src/stores/user";

export const UserMenu = () => {
  const user = useAtomValue(userAtom);

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
        >
          <Icon as={LuUserRound} boxSize={7} color="white" />
        </Box>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="200px">
            <Box px={3} py={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {user.name}
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
