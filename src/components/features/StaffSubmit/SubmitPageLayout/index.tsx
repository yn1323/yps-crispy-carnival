import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function SubmitPageLayout({ children }: Props): ReactNode {
  return (
    <Flex direction="column" minH="100dvh" bg="gray.50">
      {children}
    </Flex>
  );
}

export function SubmitPageContent({ children }: Props): ReactNode {
  return (
    <Box maxW="1024px" w="full" mx="auto">
      {children}
    </Box>
  );
}
