import type { BoxProps, ContainerProps, FlexProps, ImageProps, TextProps } from "@chakra-ui/react";
import { Box, Container, Flex, Image, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/Button";
import { UserMenu } from "./UserMenu";

export const HEADER_HEIGHT = { base: "64px", md: "68px" } as const;
export const STAFF_CONTENT_MAX_W = "1024px";
export const STAFF_PAGE_PX = { base: 4, lg: 6 } as const;

const publicNavItems = [
  { label: "機能", href: "#features" },
  { label: "導入事例", href: "#use-cases" },
  { label: "よくある質問", href: "#faq" },
  { label: "お役立ち記事", href: "#articles" },
];

type HeaderPosition = "fixed" | "sticky" | "static";

type PublicHeaderVariantProps = {
  variant: "public";
  showLinks?: boolean;
  showLogin?: boolean;
  showSignup?: boolean;
  position?: HeaderPosition;
  bg?: BoxProps["bg"];
  bgImage?: BoxProps["bgImage"];
  borderBottomWidth?: BoxProps["borderBottomWidth"];
  borderColor?: BoxProps["borderColor"];
  boxShadow?: BoxProps["boxShadow"];
};

type UserHeaderVariantProps = {
  variant?: "user";
  showUserMenu?: boolean;
  position?: HeaderPosition;
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
      <HeaderShell
        position={props.position ?? "fixed"}
        bg={props.bg}
        bgImage={props.bgImage}
        borderBottomWidth={props.borderBottomWidth}
        borderColor={props.borderColor}
        boxShadow={props.boxShadow}
      >
        <HeaderBrand to="/" ariaLabel="シフトリのトップページへ" showTagline />
        <PublicHeaderActions
          showLinks={props.showLinks ?? true}
          showLogin={props.showLogin ?? true}
          showSignup={props.showSignup ?? props.showLogin ?? true}
        />
      </HeaderShell>
    );
  }

  if (props.variant === "staff") {
    return (
      <HeaderShell position={props.fixed === false ? "static" : "fixed"} maxW={props.maxW ?? "1024px"} px={props.px}>
        <StaffHeaderContent shopName={props.shopName} />
      </HeaderShell>
    );
  }

  return (
    <HeaderShell position={props.position ?? "fixed"}>
      <HeaderBrand to="/" ariaLabel="シフトリのトップページへ" showTagline />
      {props.showUserMenu !== false && <UserMenu tone="light" />}
    </HeaderShell>
  );
};

type HeaderShellProps = {
  children: ReactNode;
  position?: HeaderPosition;
  maxW?: ContainerProps["maxW"];
  minH?: ContainerProps["minH"];
  px?: ContainerProps["px"];
  py?: ContainerProps["py"];
  justify?: FlexProps["justify"];
  bg?: BoxProps["bg"];
  bgImage?: BoxProps["bgImage"];
  borderBottomWidth?: BoxProps["borderBottomWidth"];
  borderColor?: BoxProps["borderColor"];
  boxShadow?: BoxProps["boxShadow"];
};

const HeaderShell = ({
  children,
  position = "fixed",
  maxW = "7xl",
  minH = HEADER_HEIGHT,
  px,
  py = { base: 2, md: 2.5 },
  justify = "space-between",
  bg = "whiteAlpha.950",
  bgImage,
  borderBottomWidth = "1px",
  borderColor = "blackAlpha.50",
  boxShadow,
}: HeaderShellProps) => (
  <Box
    as="header"
    position={position === "static" ? undefined : position}
    insetX={position === "fixed" ? 0 : undefined}
    top={position === "static" ? undefined : 0}
    zIndex="sticky"
    bg={bg}
    bgImage={bgImage}
    backdropFilter="blur(14px)"
    borderBottomWidth={borderBottomWidth}
    borderColor={borderColor}
    boxShadow={boxShadow}
    w="full"
  >
    <Container maxW={maxW} minH={minH} px={px} py={py} display="flex" alignItems="center">
      <Flex align="center" justify={justify} gap={{ base: 4, md: 5 }} w="full">
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
  showTagline?: boolean;
};

const HeaderBrand = ({ to, ariaLabel, logoSize, fontSize, showTagline = false }: HeaderBrandProps) => (
  <Link asChild _hover={{ opacity: 0.82, textDecoration: "none" }} flexShrink={0}>
    <RouterLink to={to} aria-label={ariaLabel}>
      <HeaderBrandContent logoSize={logoSize} fontSize={fontSize} showTagline={showTagline} />
    </RouterLink>
  </Link>
);

type HeaderBrandContentProps = {
  logoSize?: ImageProps["boxSize"];
  fontSize?: TextProps["fontSize"];
  showTagline?: boolean;
};

const HeaderBrandContent = ({ logoSize, fontSize, showTagline = false }: HeaderBrandContentProps) => (
  <Flex align="center" gap={{ base: 2.5, md: 3 }}>
    <Image src="/logo192.webp" alt="シフトリ" boxSize={logoSize ?? { base: 9, md: 9 }} objectFit="contain" />
    <Box>
      <Text
        color="gray.950"
        fontSize={fontSize ?? { base: "lg", md: "xl" }}
        fontWeight="black"
        letterSpacing="0"
        lineHeight="1"
      >
        シフトリ
      </Text>
      {showTagline && (
        <Text mt={0.5} color="gray.700" fontSize="2xs" fontWeight="bold" lineHeight="1">
          LINEで使えるシフト管理
        </Text>
      )}
    </Box>
  </Flex>
);

const PublicHeaderActions = ({
  showLinks,
  showLogin,
  showSignup,
}: {
  showLinks: boolean;
  showLogin: boolean;
  showSignup: boolean;
}) => (
  <>
    {showLinks && (
      <Flex as="nav" display={{ base: "none", lg: "flex" }} align="center" gap={{ md: 4, xl: 6 }}>
        {publicNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            color="gray.900"
            fontSize="sm"
            fontWeight="bold"
            _hover={{ color: "teal.700", textDecoration: "none" }}
          >
            {item.label}
          </Link>
        ))}
      </Flex>
    )}

    {(showLogin || showSignup) && (
      <Flex align="center" gap={{ base: 2, md: 3 }} flexShrink={0}>
        {showLogin && <PublicLoginButton />}
        {showSignup && <PublicSignupButton />}
      </Flex>
    )}
  </>
);

type PublicLoginButtonProps = {
  display?: BoxProps["display"];
};

const PublicLoginButton = ({ display }: PublicLoginButtonProps) => (
  <Button
    asChild
    type="button"
    display={display}
    variant="outline"
    colorPalette="teal"
    bg="white"
    h="38px"
    px={{ base: 4, md: 5 }}
    borderRadius="md"
    fontSize="sm"
    fontWeight="bold"
  >
    <RouterLink to="/login" search={{ redirect: undefined }}>
      ログイン
    </RouterLink>
  </Button>
);

const PublicSignupButton = () => (
  <Button asChild colorPalette="teal" h="38px" px={5} borderRadius="md" fontSize="sm" fontWeight="bold" hideBelow="md">
    <RouterLink to="/signup" search={{ redirect: undefined }}>
      無料で試してみる
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
      <HeaderBrandContent logoSize={{ base: 6, lg: 7 }} fontSize={{ base: "sm", lg: "md" }} />
    </Flex>
  </Flex>
);
