import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Header, STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";

type Props = {
  children: ReactNode;
};

type HeaderProps = {
  shopName: string;
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
    <Box maxW={STAFF_CONTENT_MAX_W} w="full" mx="auto">
      {children}
    </Box>
  );
}

export function SubmitPageHeader({ shopName }: HeaderProps): ReactNode {
  return <Header variant="staff" shopName={shopName} fixed={false} maxW={STAFF_CONTENT_MAX_W} px={4} />;
}
