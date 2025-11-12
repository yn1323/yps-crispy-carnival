import { Box } from "@chakra-ui/react";
import { resetUserAtom } from "@/src/stores/user";

export const TopPage = () => {
  resetUserAtom();

  return <Box/>
};
