import { Box, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  LuBookOpen,
  LuBuilding2,
  LuChevronDown,
  LuLogOut,
  LuMailQuestion,
  LuShieldCheck,
  LuUserRound,
} from "react-icons/lu";
import { selectedShopAtom } from "@/src/stores/shop";
import { featureVisibilityAtom, userAtom } from "@/src/stores/user";

type Props = {
  tone?: "dark" | "light";
};

export const UserMenu = ({ tone = "dark" }: Props) => {
  const user = useAtomValue(userAtom);
  const selectedShop = useAtomValue(selectedShopAtom);
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const displayName = user.name || "ユーザー";
  const isLight = tone === "light";
  const showGroupSettings = featureVisibility.organizationSettingsNavigation;

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
          gap={{ base: 0, md: 2 }}
          minW={0}
          px={isLight ? { base: 1.5, md: 2.5 } : undefined}
          py={isLight ? 1 : undefined}
          borderRadius={isLight ? "full" : undefined}
          bg={isLight ? "whiteAlpha.700" : undefined}
          borderWidth={isLight ? "1px" : undefined}
          borderColor={isLight ? "whiteAlpha.900" : undefined}
        >
          <Flex
            boxSize={8}
            borderRadius="full"
            bg={isLight ? "teal.600" : "white"}
            color={isLight ? "white" : "teal.600"}
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Icon as={LuUserRound} boxSize={5} />
          </Flex>
          <Text
            display={{ base: "none", md: "block" }}
            color={isLight ? "gray.900" : "white"}
            fontSize="sm"
            fontWeight="semibold"
            maxW={{ base: "96px", md: "160px" }}
            truncate
          >
            {displayName}
          </Text>
          <Icon
            as={LuChevronDown}
            display={{ base: "none", md: "block" }}
            boxSize={5}
            color={isLight ? "gray.700" : "white"}
            flexShrink={0}
          />
        </Box>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="200px">
            <Box px={3} py={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {displayName}
              </Text>
            </Box>
            <Menu.Separator />
            <Menu.Item asChild value="login-settings" cursor="pointer">
              <RouterLink to="/account">
                <LuShieldCheck aria-hidden />
                アカウント設定
              </RouterLink>
            </Menu.Item>
            {showGroupSettings && (
              <Menu.Item asChild value="group-settings" cursor="pointer">
                <RouterLink to="/settings" search={{ shop: selectedShop?.shopId }}>
                  <LuBuilding2 aria-hidden />
                  組織設定
                </RouterLink>
              </Menu.Item>
            )}
            <Menu.Item asChild value="howto" cursor="pointer">
              <a href="/howto" target="_blank" rel="noreferrer">
                <LuBookOpen />
                使い方・ヘルプ
              </a>
            </Menu.Item>
            <Menu.Item asChild value="contact" cursor="pointer">
              <a href="/contact" target="_blank" rel="noreferrer">
                <LuMailQuestion />
                お問い合わせ
              </a>
            </Menu.Item>
            {/* 店舗削除入口は誤操作リスクを再検討するため一時停止中。 */}
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
