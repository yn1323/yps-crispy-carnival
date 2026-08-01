import { Alert, Box, Flex, Icon, Input, Link, Separator, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";

type AuthRoutePath = "/login" | "/signup" | "/forgot-password";

export const AuthError = ({ message }: { message?: string }) => {
  if (!message) return null;

  return (
    <Alert.Root status="error" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{message}</Alert.Description>
    </Alert.Root>
  );
};

type OAuthSectionProps = {
  label: string;
  isLineBrowser?: boolean;
  isSubmitting?: boolean;
  onClick: () => void | Promise<void>;
};

export const OAuthSection = ({ label, isLineBrowser, isSubmitting, onClick }: OAuthSectionProps) => (
  <>
    {/* LINE内ブラウザではGoogle OAuthが使えないため、Googleボタンが外部ブラウザ起動に変わることを案内する */}
    {isLineBrowser && (
      <Alert.Root status="warning" borderRadius="lg">
        <Alert.Indicator />
        <Alert.Description>
          LINEアプリ内では、Googleログインを利用できません。
          <br />
          Googleのボタンを押すと、このページを外部ブラウザで開き直します。
        </Alert.Description>
      </Alert.Root>
    )}
    <Button type="button" size="lg" variant="outline" onClick={onClick} disabled={isSubmitting}>
      <Icon as={FcGoogle} boxSize={5} />
      {label}
    </Button>
    <Flex align="center" gap={4}>
      <Separator flex={1} />
      <Text color="gray.500" fontSize="sm">
        または
      </Text>
      <Separator flex={1} />
    </Flex>
  </>
);

type AuthModeLinkProps = Omit<ComponentProps<typeof Link>, "asChild" | "children" | "href"> & {
  children: ReactNode;
  redirectTo: string;
  to: AuthRoutePath;
};

export const AuthModeLink = ({ children, redirectTo, to, ...linkProps }: AuthModeLinkProps) => (
  <Link asChild _hover={{ color: "teal.800", textDecoration: "underline" }} {...linkProps}>
    <RouterLink to={to} search={{ redirect: redirectTo }}>
      {children}
    </RouterLink>
  </Link>
);

export const PasswordInput = (props: ComponentProps<typeof Input>) => {
  const [visible, setVisible] = useState(false);

  return (
    <Box position="relative" w="full">
      <Input type={visible ? "text" : "password"} w="full" pr="3rem" {...props} />
      <IconButton
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
        type="button"
        variant="ghost"
        size="sm"
        position="absolute"
        top="50%"
        right={1}
        transform="translateY(-50%)"
        onClick={() => setVisible((current) => !current)}
      >
        <Icon as={visible ? LuEyeOff : LuEye} boxSize={4} />
      </IconButton>
    </Box>
  );
};

// Clerk の Bot sign-up protection はこの ID を起点に CAPTCHA を描画する。
export const ClerkCaptcha = () => (
  <Box id="clerk-captcha" w="full" minH="1px" data-cl-theme="light" data-cl-size="flexible" data-cl-language="ja-JP" />
);
