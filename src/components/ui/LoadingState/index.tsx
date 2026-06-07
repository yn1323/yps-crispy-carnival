import type { BoxProps } from "@chakra-ui/react";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

type Props = {
  message?: string;
  minH?: BoxProps["minH"];
};

export const LoadingState = ({ message = "Loading...", minH = "400px" }: Props) => (
  <ShiftoriLoading variant="section" message={message} minH={minH} />
);
