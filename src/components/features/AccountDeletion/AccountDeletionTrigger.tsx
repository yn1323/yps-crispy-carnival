import { Flex } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";

export type AccountDeletionVariant = "setup" | "legacy";

type Props = {
  variant: AccountDeletionVariant;
  onOpen: () => void;
};

export function AccountDeletionTrigger({ variant, onOpen }: Props) {
  if (variant === "legacy") {
    return (
      <Button variant="outline" colorPalette="red" onClick={onOpen}>
        アカウントを削除
      </Button>
    );
  }

  return (
    <Flex
      direction={{ base: "column", sm: "row" }}
      justify={{ base: "center", md: "flex-end" }}
      align="center"
      gap={{ base: 1, sm: 2 }}
      px={{ base: 1, md: 2 }}
    >
      <Button variant="plain" colorPalette="red" size="sm" minH={{ base: "44px", md: "auto" }} onClick={onOpen}>
        アカウントを削除
      </Button>
    </Flex>
  );
}
