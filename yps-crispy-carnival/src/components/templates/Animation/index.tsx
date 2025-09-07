import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode | ReactNode[];
  fullScreen?: boolean;
};

export const Animation = ({ children, fullScreen = true }: Props) => {
  const childComponents = Array.isArray(children) ? children : [children];

  return (
    <Box
      w={fullScreen ? "100%" : "auto"}
      h={fullScreen ? "100%" : "auto"}
      data-state="open"
      _open={{
        animation: "fade-in 100ms ease-out",
      }}
    >
      {childComponents}
    </Box>
  );
};
