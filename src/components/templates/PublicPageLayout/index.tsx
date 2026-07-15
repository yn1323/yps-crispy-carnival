import { Box, type BoxProps } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { HEADER_HEIGHT, Header, type HeaderProps } from "@/src/components/templates/Header";
import { PublicFooter } from "@/src/components/templates/PublicFooter";

type PublicHeaderProps = Omit<Extract<HeaderProps, { variant: "public" }>, "variant">;

type Props = {
  children: ReactNode;
  headerProps?: PublicHeaderProps;
  mainProps?: Omit<BoxProps, "as" | "children">;
  bg?: BoxProps["bg"];
  color?: BoxProps["color"];
  minH?: BoxProps["minH"];
  showFooter?: boolean;
};

export function PublicPageLayout({
  children,
  headerProps,
  mainProps,
  bg = "white",
  color = "fg",
  minH = "100vh",
  showFooter = true,
}: Props) {
  const headerPosition = headerProps?.position ?? "fixed";

  return (
    <Box bg={bg} color={color} minH={minH}>
      <Header variant="public" {...headerProps} />
      <Box as="main" pt={headerPosition === "fixed" ? HEADER_HEIGHT : undefined} {...mainProps}>
        {children}
      </Box>
      {showFooter && <PublicFooter />}
    </Box>
  );
}
