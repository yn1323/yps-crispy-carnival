import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useClerk } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { LuLogOut, LuSettings, LuStore } from "react-icons/lu";
import { ShopSelector } from "@/src/components/features/Shop/ShopSelector";
import { BottomSheet } from "@/src/components/ui/BottomSheet";

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
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <VStack align="stretch" gap={0}>
        {/* 店舗選択 */}
        <Box p={4} borderBottomWidth="1px" borderColor="gray.200">
          <ShopSelector
            shops={shops}
            selectedShopId={selectedShopId}
            onShopChange={handleShopChange}
            usePortal={false}
          />
        </Box>

        {/* メニュー項目 */}
        <Link to="/shops" onClick={onClose}>
          <Flex align="center" p={4} _hover={{ bg: "gray.50" }}>
            <Icon as={LuStore} mr={3} />
            <Text>店舗一覧</Text>
          </Flex>
        </Link>

        <Link to="/settings" onClick={onClose}>
          <Flex align="center" p={4} _hover={{ bg: "gray.50" }}>
            <Icon as={LuSettings} mr={3} />
            <Text>設定</Text>
          </Flex>
        </Link>

        <Box as="button" onClick={handleSignOut} w="100%" textAlign="left">
          <Flex align="center" p={4} _hover={{ bg: "gray.50" }} color="red.500">
            <Icon as={LuLogOut} mr={3} />
            <Text>ログアウト</Text>
          </Flex>
        </Box>
      </VStack>
    </BottomSheet>
  );
};
