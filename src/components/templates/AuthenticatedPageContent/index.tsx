import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { AUTHENTICATED_APP_CONTENT_HEIGHT } from "@/src/components/templates/AuthenticatedAppShell";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

type Props = {
  children: ReactNode;
  includeMobileNavigation?: boolean;
};

export function AuthenticatedPageContent({ children, includeMobileNavigation = false }: Props) {
  return (
    <Box
      minH={
        includeMobileNavigation
          ? AUTHENTICATED_APP_CONTENT_HEIGHT
          : {
              base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
              md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
            }
      }
      bg="gray.50"
    >
      <RootContentWrapper>{children}</RootContentWrapper>
    </Box>
  );
}
