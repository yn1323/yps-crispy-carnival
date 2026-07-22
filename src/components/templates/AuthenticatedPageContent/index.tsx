import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

type Props = {
  children: ReactNode;
};

export function AuthenticatedPageContent({ children }: Props) {
  return (
    <Box
      minH={{
        base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
        md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
      }}
      bg="gray.50"
    >
      <RootContentWrapper>{children}</RootContentWrapper>
    </Box>
  );
}
