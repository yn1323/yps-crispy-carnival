import { Box } from "@chakra-ui/react";
import type { FocusEventHandler, ReactNode, Ref } from "react";

type Props = {
  children: ReactNode;
  sectionRef?: Ref<HTMLDivElement>;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
};

export function UserShopDetailPageSection({ children, sectionRef, onFocusCapture }: Props) {
  return (
    <Box
      ref={sectionRef}
      onFocusCapture={onFocusCapture}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      p={{ base: 4, md: 6 }}
    >
      {children}
    </Box>
  );
}
