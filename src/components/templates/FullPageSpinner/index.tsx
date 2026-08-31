import { Box } from "@chakra-ui/react";
import { AUTHENTICATED_APP_HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

const AUTHENTICATED_LOADING_MESSAGE = "Loading...";

type Props = {
  showHeader?: boolean;
  reserveHeaderSpace?: boolean;
  mobileNavigationHeight?: string;
};

export function FullPageSpinner({ showHeader = false, reserveHeaderSpace = true, mobileNavigationHeight }: Props) {
  const mobileNavigationPadding = mobileNavigationHeight
    ? {
        base: `calc(${mobileNavigationHeight} + env(safe-area-inset-bottom))`,
        lg: 0,
      }
    : undefined;

  if (showHeader) {
    return (
      <Box w="100%">
        <Header />
        <Box pt={AUTHENTICATED_APP_HEADER_HEIGHT}>
          <ShiftoriLoading
            variant="section"
            message={AUTHENTICATED_LOADING_MESSAGE}
            minH={{
              base: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.base})`,
              md: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.md})`,
            }}
            pb={mobileNavigationPadding}
            boxSizing="border-box"
          />
        </Box>
      </Box>
    );
  }

  if (reserveHeaderSpace) {
    return (
      <ShiftoriLoading
        variant="section"
        message={AUTHENTICATED_LOADING_MESSAGE}
        minH="100dvh"
        pt={AUTHENTICATED_APP_HEADER_HEIGHT}
        pb={mobileNavigationPadding}
        boxSizing="border-box"
      />
    );
  }

  return <ShiftoriLoading variant="page" />;
}
