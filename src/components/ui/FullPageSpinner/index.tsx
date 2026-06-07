import { Box } from "@chakra-ui/react";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

type Props = {
  showHeader?: boolean;
};

export function FullPageSpinner({ showHeader = false }: Props) {
  if (showHeader) {
    return (
      <Box w="100%">
        <Header showUserMenu={false} />
        <Box pt={HEADER_HEIGHT}>
          <ShiftoriLoading
            variant="section"
            minH={{
              base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
              md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
            }}
          />
        </Box>
      </Box>
    );
  }

  return <ShiftoriLoading variant="page" />;
}
