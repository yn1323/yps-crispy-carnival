import { Flex, Spinner } from "@chakra-ui/react";

export function FullPageSpinner() {
  return (
    <Flex justify="center" align="center" minH="100vh">
      <Spinner />
    </Flex>
  );
}
