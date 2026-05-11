import { Box, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { useAtomValue } from "jotai";
import { LuChevronDown, LuLogOut, LuUserRound } from "react-icons/lu";
import { userAtom } from "@/src/stores/user";

type Props = {
  tone?: "dark" | "light";
};

export const UserMenu = ({ tone = "dark" }: Props) => {
  const user = useAtomValue(userAtom);
  const displayName = user.name || "ユーザー";
  const isLight = tone === "light";

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
          px={isLight ? { base: 1.5, md: 2.5 } : undefined}
          py={isLight ? 1 : undefined}
          borderRadius={isLight ? "full" : undefined}
          bg={isLight ? "whiteAlpha.700" : undefined}
          borderWidth={isLight ? "1px" : undefined}
          borderColor={isLight ? "whiteAlpha.900" : undefined}
        >
          <Flex
            boxSize={9}
            borderRadius="full"
            bg={isLight ? "teal.600" : "white"}
            color={isLight ? "white" : "teal.600"}
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Icon as={LuUserRound} boxSize={6} />
          </Flex>
          <Text
            color={isLight ? "gray.900" : "white"}
            fontSize="sm"
            fontWeight="semibold"
            maxW={{ base: "96px", md: "160px" }}
            truncate
          >
            {displayName}
          </Text>
          <Icon as={LuChevronDown} boxSize={5} color={isLight ? "gray.700" : "white"} flexShrink={0} />
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
