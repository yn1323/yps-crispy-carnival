import type { BoxProps, ContainerProps, FlexProps, ImageProps, TextProps } from "@chakra-ui/react";
import { Box, Container, Flex, Image, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/Button";
import { UserMenu } from "./UserMenu";

export const HEADER_BG_IMAGE = "linear-gradient(to bottom, #C5E9E5 0%, #E6F7F5 93%, rgba(230, 247, 245, 0) 100%)";
export const HEADER_HEIGHT = { base: "66px", md: "80px" } as const;
export const STAFF_CONTENT_MAX_W = "1024px";
export const STAFF_PAGE_PX = { base: 4, lg: 6 } as const;

const publicNavItems = [
  { label: "シフトリでできること", href: "#features" },
  { label: "よくある質問", href: "#faq" },
];

type PublicHeaderVariantProps = {
  variant: "public";
  showLinks?: boolean;
  showLogin?: boolean;
};

type UserHeaderVariantProps = {
  variant?: "user";
};

type StaffHeaderVariantProps = {
  variant: "staff";
  shopName: string;
  fixed?: boolean;
  maxW?: ContainerProps["maxW"];
  px?: ContainerProps["px"];
};

export type HeaderProps = PublicHeaderVariantProps | UserHeaderVariantProps | StaffHeaderVariantProps;

export const Header = (props: HeaderProps = {}) => {
  if (props.variant === "public") {
    return (
      <HeaderShell>
        <HeaderBrand to="/" />
        <PublicHeaderActions showLinks={props.showLinks ?? true} showLogin={props.showLogin ?? true} />
      </HeaderShell>
    );
  }

  if (props.variant === "staff") {
    return (
      <HeaderShell fixed={props.fixed} maxW={props.maxW ?? "1024px"} px={props.px}>
        <StaffHeaderContent shopName={props.shopName} />
      </HeaderShell>
    );
  }

  return (
    <HeaderShell>
      <HeaderBrand to="/" ariaLabel="シフトリのトップページへ" />
      <UserMenu tone="light" />
    </HeaderShell>
  );
};

type HeaderShellProps = {
  children: ReactNode;
  fixed?: boolean;
  maxW?: ContainerProps["maxW"];
  minH?: ContainerProps["minH"];
  px?: ContainerProps["px"];
  py?: ContainerProps["py"];
  justify?: FlexProps["justify"];
  bgImage?: BoxProps["bgImage"];
};

const HeaderShell = ({
  children,
  fixed = true,
  maxW = "7xl",
  minH = HEADER_HEIGHT,
  px,
  py = { base: 3, md: 4 },
  justify = "space-between",
  bgImage = HEADER_BG_IMAGE,
}: HeaderShellProps) => (
  <Box
    as="header"
    position={fixed ? "fixed" : undefined}
    insetX={fixed ? 0 : undefined}
    top={fixed ? 0 : undefined}
    zIndex="sticky"
    bgImage={bgImage}
    w="full"
  >
    <Container maxW={maxW} minH={minH} px={px} py={py} display="flex" alignItems="center">
      <Flex align="center" justify={justify} gap={6} w="full">
        {children}
      </Flex>
    </Container>
  </Box>
);

type HeaderBrandProps = {
  to: string;
  ariaLabel?: string;
  logoSize?: ImageProps["boxSize"];
  fontSize?: TextProps["fontSize"];
};

const HeaderBrand = ({ to, ariaLabel, logoSize, fontSize }: HeaderBrandProps) => (
  <Link asChild _hover={{ opacity: 0.8, textDecoration: "none" }}>
    <RouterLink to={to} aria-label={ariaLabel}>
      <Flex align="center" gap={3}>
        <Image src="/logo192.webp" alt="シフトリ" boxSize={logoSize ?? { base: 9, md: 10 }} objectFit="contain" />
        <Text
          color="gray.950"
          fontSize={fontSize ?? { base: "xl", md: "2xl" }}
          fontWeight="bold"
          letterSpacing="0"
          lineHeight="1"
        >
          シフトリ
        </Text>
      </Flex>
    </RouterLink>
  </Link>
);

const PublicHeaderActions = ({ showLinks, showLogin }: { showLinks: boolean; showLogin: boolean }) => (
  <>
    {(showLinks || showLogin) && (
      <Flex display={{ base: "none", md: "flex" }} align="center" gap={{ md: 7, lg: 9 }}>
        {showLinks &&
          publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              color="gray.950"
              textStyle="sm"
              fontWeight="bold"
              _hover={{ color: "teal.700", textDecoration: "none" }}
            >
              {item.label}
            </Link>
          ))}
        {showLogin && <PublicLoginButton h="48px" px={6} />}
      </Flex>
    )}

    {showLogin && <PublicLoginButton display={{ base: "inline-flex", md: "none" }} h="42px" px={5} />}
  </>
);

type PublicLoginButtonProps = {
  display?: BoxProps["display"];
  h: BoxProps["h"];
  px: BoxProps["px"];
};

const PublicLoginButton = ({ display, h, px }: PublicLoginButtonProps) => (
  <Button
    asChild
    type="button"
    display={display}
    variant="solid"
    colorPalette="teal"
    h={h}
    px={px}
    borderRadius="full"
    fontWeight="bold"
  >
    <RouterLink to="/login" search={{ redirect: undefined }}>
      ログイン
    </RouterLink>
  </Button>
);

const StaffHeaderContent = ({ shopName }: { shopName: string }) => (
  <Flex align="center" justify="space-between" gap={4} minW={0} w="full">
    <Text
      color="gray.950"
      fontWeight="bold"
      fontSize={{ base: "md", lg: "lg" }}
      overflow="hidden"
      textOverflow="ellipsis"
      whiteSpace="nowrap"
      minW={0}
      flex={1}
    >
      {shopName}
    </Text>
    <Flex align="center" gap={{ base: 1.5, lg: 2 }} flexShrink={0}>
      <Text color="gray.700" fontSize={{ base: "2xs", lg: "xs" }} fontWeight="semibold" whiteSpace="nowrap">
        Powered by
      </Text>
      <HeaderBrand
        to="/"
        ariaLabel="シフトリのトップページへ"
        logoSize={{ base: 6, lg: 7 }}
        fontSize={{ base: "sm", lg: "md" }}
      />
    </Flex>
  </Flex>
);
