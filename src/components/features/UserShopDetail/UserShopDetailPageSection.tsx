import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function UserShopDetailPageSection({ children }: Props) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 6 }}>
      {children}
    </Box>
  );
}
