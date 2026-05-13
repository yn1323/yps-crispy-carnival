import { Box, type BoxProps, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { HEADER_HEIGHT, Header, STAFF_CONTENT_MAX_W, STAFF_PAGE_PX } from "@/src/components/templates/Header";

const STAFF_NARROW_CONTENT_MAX_W = "480px";

type Props = {
  shopName: string;
  children: ReactNode;
};

export function StaffLayout({ shopName, children }: Props) {
  return (
    <Flex direction="column">
      <Header variant="staff" shopName={shopName} maxW={STAFF_CONTENT_MAX_W} px={STAFF_PAGE_PX} />
      <Box pt={HEADER_HEIGHT} flex={1} display="flex" flexDirection="column" minH="100dvh">
        {children}
      </Box>
    </Flex>
  );
}

type StaffPageContentProps = BoxProps & {
  children: ReactNode;
};

export function StaffPageContent({
  children,
  maxW = STAFF_CONTENT_MAX_W,
  px = STAFF_PAGE_PX,
  ...props
}: StaffPageContentProps) {
  return (
    <Box w="full" maxW={maxW} mx="auto" px={px} {...props}>
      {children}
    </Box>
  );
}

export function StaffNarrowContent(props: StaffPageContentProps) {
  return <StaffPageContent maxW={STAFF_NARROW_CONTENT_MAX_W} {...props} />;
}

export function StaffCenteredContent({
  children,
  alignItems = "center",
  justifyContent = "center",
  ...props
}: StaffPageContentProps) {
  return (
    <StaffNarrowContent
      flex={1}
      display="flex"
      flexDirection="column"
      alignItems={alignItems}
      justifyContent={justifyContent}
      py={{ base: 8, lg: 10 }}
      {...props}
    >
      {children}
    </StaffNarrowContent>
  );
}
