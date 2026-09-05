import { Button, ChakraProvider, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ANALYTICS_AUTH_EXPIRED_EVENT } from "@/api/analyticsClient";
import { system } from "@/styles/theme";
import { AnalyticsEnvironmentProvider } from "./analyticsEnvironment";
import { queryClient } from "./queryClient";

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [authExpired, setAuthExpired] = useState(false);
  useEffect(() => {
    const clear = () => {
      setAuthExpired(true);
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    window.addEventListener(ANALYTICS_AUTH_EXPIRED_EVENT, clear);
    return () => window.removeEventListener(ANALYTICS_AUTH_EXPIRED_EVENT, clear);
  }, []);
  return (
    <ChakraProvider value={system}>
      {authExpired ? (
        <Container maxW="lg" py={16}>
          <Stack gap={5}>
            <Heading>本人認証を確認してください</Heading>
            <Text>ページを再読み込みして、本人認証後に開き直してください。</Text>
            <Button onClick={() => window.location.reload()}>再読み込み</Button>
          </Stack>
        </Container>
      ) : (
        <QueryClientProvider client={queryClient}>
          <AnalyticsEnvironmentProvider>{children}</AnalyticsEnvironmentProvider>
        </QueryClientProvider>
      )}
    </ChakraProvider>
  );
};
