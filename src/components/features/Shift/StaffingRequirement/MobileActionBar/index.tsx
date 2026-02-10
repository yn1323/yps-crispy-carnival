import { Box, Button, Flex, Icon } from "@chakra-ui/react";
import { LuSave } from "react-icons/lu";

type MobileActionBarProps = {
  onSave: () => void;
  hasChanges: boolean;
  isSaving: boolean;
};

export const MobileActionBar = ({ onSave, hasChanges, isSaving }: MobileActionBarProps) => {
  return (
    <Flex
      display={{ base: "flex", md: "none" }}
      position="fixed"
      bottom="60px"
      left={0}
      right={0}
      justify="flex-end"
      align="center"
      px={3}
      py={2}
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.200"
      boxShadow="0 -2px 8px rgba(0, 0, 0, 0.08)"
      zIndex={10}
      h="48px"
    >
      <Button
        size="sm"
        colorPalette="teal"
        onClick={onSave}
        disabled={!hasChanges}
        loading={isSaving}
        borderRadius="full"
        px={3}
      >
        {hasChanges && <Box as="span" w="6px" h="6px" borderRadius="full" bg="orange.400" mr={1} />}
        <Icon as={LuSave} boxSize={3.5} />
        保存
      </Button>
    </Flex>
  );
};
