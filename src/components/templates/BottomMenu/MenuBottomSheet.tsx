import { Box, Dialog as ChakraDialog, Flex, Icon, Portal, Text, VStack } from "@chakra-ui/react";
import { useClerk } from "@clerk/clerk-react";
import { LuLogOut, LuX } from "react-icons/lu";

type MenuBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
};

const MenuItem = ({
  icon,
  label,
  onClick,
  color = "gray.800",
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  color?: string;
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
  </Flex>
);

export const MenuBottomSheet = ({ isOpen, onOpenChange, onClose }: MenuBottomSheetProps) => {
  const { signOut } = useClerk();

  const handleSignOut = () => {
    onClose();
    signOut();
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
                {/* ログアウト */}
                <Box bg="white">
                  <MenuItem icon={LuLogOut} label="ログアウト" color="red.500" onClick={handleSignOut} />
                </Box>
              </VStack>
            </Box>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
