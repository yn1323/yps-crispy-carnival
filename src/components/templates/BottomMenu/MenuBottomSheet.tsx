import { Box, Dialog as ChakraDialog, Flex, Icon, Portal, Text, VStack } from "@chakra-ui/react";
import { useClerk } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { LuChevronRight, LuLogOut, LuSettings, LuX } from "react-icons/lu";
import { ShopSelector } from "@/src/components/features/Shop/ShopSelector";

type Shop = {
  _id: string;
  shopName: string;
};

type MenuBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  shops: Shop[];
  selectedShopId: string | null;
  onShopChange: (shop: { shopId: string; shopName: string }) => void;
};

const MenuItem = ({
  icon,
  label,
  onClick,
  color = "gray.800",
  showArrow = true,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  color?: string;
  showArrow?: boolean;
}) => (
  <Flex
    as="button"
    align="center"
    w="100%"
    h="56px"
    px={5}
    bg="white"
    color={color}
    _hover={{ bg: "gray.50" }}
    _active={{ bg: "gray.100" }}
    transition="background 0.15s"
    onClick={onClick}
  >
    <Icon as={icon} boxSize={5} color={color === "gray.800" ? "teal.600" : color} />
    <Text ml={4} flex={1} textAlign="left" fontWeight="medium">
      {label}
    </Text>
    {showArrow && <Icon as={LuChevronRight} boxSize={5} color="gray.400" />}
  </Flex>
);

export const MenuBottomSheet = ({
  isOpen,
  onOpenChange,
  onClose,
  shops,
  selectedShopId,
  onShopChange,
}: MenuBottomSheetProps) => {
  const { signOut } = useClerk();

  const handleSignOut = () => {
    signOut();
  };

  const handleShopChange = (shop: { shopId: string; shopName: string }) => {
    onShopChange(shop);
    onClose();
  };

  return (
    <ChakraDialog.Root open={isOpen} onOpenChange={onOpenChange} placement="bottom" size="full" modal={false}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content
            borderRadius={0}
            h="100dvh"
            maxH="100dvh"
            display="flex"
            flexDirection="column"
            data-state="open"
            _open={{
              animation: "slide-from-bottom 0.25s ease-out",
            }}
            _closed={{
              animation: "slide-to-bottom 0.2s ease-in",
            }}
          >
            {/* Header */}
            <Flex align="center" h="56px" px={2} borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
              <ChakraDialog.CloseTrigger asChild>
                <Box
                  as="button"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  w="44px"
                  h="44px"
                  borderRadius="full"
                  cursor="pointer"
                  _hover={{ bg: "gray.100" }}
                  _active={{ bg: "gray.200" }}
                >
                  <Icon as={LuX} boxSize={6} color="gray.700" />
                </Box>
              </ChakraDialog.CloseTrigger>
              <Text fontSize="lg" fontWeight="bold" color="gray.800">
                メニュー
              </Text>
            </Flex>

            {/* Content */}
            <Box flex={1} overflowY="auto" bg="gray.50">
              <VStack align="stretch" gap={4} py={4}>
                {/* 店舗セクション */}
                <Box bg="gray.100">
                  <Box px={5} py={3}>
                    <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={3}>
                      現在の店舗
                    </Text>
                    <ShopSelector
                      shops={shops}
                      selectedShopId={selectedShopId}
                      onShopChange={handleShopChange}
                      usePortal={false}
                    />
                    <Link to="/shops" onClick={onClose}>
                      <Text
                        fontSize="xs"
                        color="teal.600"
                        mt={3}
                        _hover={{ textDecoration: "underline" }}
                        cursor="pointer"
                        transition="all 0.15s"
                      >
                        店舗一覧を見る
                      </Text>
                    </Link>
                  </Box>
                </Box>

                {/* アカウントセクション */}
                <Box bg="white">
                  <Text fontSize="xs" fontWeight="medium" color="gray.500" px={5} py={3}>
                    アカウント
                  </Text>
                  <Link to="/settings" onClick={onClose} style={{ display: "block" }}>
                    <MenuItem icon={LuSettings} label="設定" />
                  </Link>
                </Box>

                {/* ログアウト */}
                <Box bg="white">
                  <MenuItem
                    icon={LuLogOut}
                    label="ログアウト"
                    color="red.500"
                    showArrow={false}
                    onClick={handleSignOut}
                  />
                </Box>
              </VStack>
            </Box>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
