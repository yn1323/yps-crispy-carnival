import { Container } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const RootContentWrapper = ({ children }: Props) => {
  return (
    <Container maxW="1024px" px={4} pb={8} pt={{ base: 4, lg: 8 }} w="100%">
      {children}
    </Container>
  );
};
