import { Box, Flex } from "@chakra-ui/react";
import { StaffHeader } from "@/src/components/templates/StaffHeader";

/** StaffHeaderの高さに合わせたpadding-top */
const HEADER_PT = { base: "48px", lg: "56px" };

type Props = {
  shopName: string;
  children: React.ReactNode;
};

export function StaffLayout({ shopName, children }: Props) {
  return (
    <Flex direction="column" minH="100vh">
      <StaffHeader shopName={shopName} />
      <Box pt={HEADER_PT} flex={1} display="flex" flexDirection="column">
        {children}
      </Box>
    </Flex>
  );
}
