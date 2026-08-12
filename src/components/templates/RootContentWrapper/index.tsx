import { Container } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const RootContentWrapper = ({ children }: Props) => {
  return (
    <Container maxW="1024px" p={4} w="100%">
      {children}
    </Container>
  );
};
