import { Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const ContentWrapper = ({ children }: Props) => {
  return (
    <Stack maxW="1024px" w="full" mx="auto" gap={{ base: 6, lg: 8 }}>
      {children}
    </Stack>
  );
};
