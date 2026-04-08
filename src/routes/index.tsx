import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="100vh" bg="gray.50">
      <VStack gap={4}>
        <Text fontSize="2xl" fontWeight="bold" color="teal.600">
          シフトリ
        </Text>
        <SignInButton mode="modal">
          <Button colorPalette="teal">ログイン</Button>
        </SignInButton>
      </VStack>
    </Box>
  );
}
