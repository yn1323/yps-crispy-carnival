import { Box, Flex, Menu, Portal, Text } from "@chakra-ui/react";
import { useEffect } from "react";

type ContextMenuProps = {
  position: { x: number; y: number } | null;
  isOpen: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  canPaste: boolean;
};

export const ContextMenu = ({ position, isOpen, onClose, onCopy, onPaste, onDelete, canPaste }: ContextMenuProps) => {
  // クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = () => {
      onClose();
    };

    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  return (
    <Menu.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()}>
      <Portal>
        <Menu.Positioner
          style={{
            position: "fixed",
            left: `${position.x}px`,
            top: `${position.y}px`,
            zIndex: 1000,
          }}
        >
          <Menu.Content minWidth="180px" boxShadow="lg" borderRadius="md" py={1}>
            <Menu.Item
              value="copy"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
                onClose();
              }}
              cursor="pointer"
              px={3}
              py={2}
              _hover={{ bg: "gray.100" }}
            >
              <Flex justify="space-between" width="100%">
                <Text>コピー</Text>
                <Text color="gray.500" fontSize="xs">
                  Ctrl+C
                </Text>
              </Flex>
            </Menu.Item>

            <Menu.Item
              value="paste"
              onClick={(e) => {
                e.stopPropagation();
                if (canPaste) {
                  onPaste();
                }
                onClose();
              }}
              cursor={canPaste ? "pointer" : "not-allowed"}
              px={3}
              py={2}
              _hover={{ bg: canPaste ? "gray.100" : undefined }}
              opacity={canPaste ? 1 : 0.5}
            >
              <Flex justify="space-between" width="100%">
                <Text>貼り付け</Text>
                <Text color="gray.500" fontSize="xs">
                  Ctrl+V
                </Text>
              </Flex>
            </Menu.Item>

            <Box borderTop="1px solid" borderColor="gray.200" my={1} />

            <Menu.Item
              value="delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                onClose();
              }}
              cursor="pointer"
              px={3}
              py={2}
              _hover={{ bg: "red.50" }}
              color="red.600"
            >
              <Text>削除</Text>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};
