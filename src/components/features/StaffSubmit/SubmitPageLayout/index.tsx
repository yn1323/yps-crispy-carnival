import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { STAFF_CONTENT_MAX_W, StaffHeaderBrand } from "@/src/components/templates/StaffHeader";

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
  return (
    <Box bg="teal.600" w="full">
      <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" h={{ base: "56px", lg: "56px" }} px={4} align="center">
        <StaffHeaderBrand shopName={shopName} />
      </Flex>
    </Box>
  );
}
