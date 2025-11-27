import { Box, Spinner, Text, VStack } from "@chakra-ui/react";

type Props = {
  message?: string;
  minH?: string;
};

export const LoadingState = ({ message = "読み込み中...", minH = "400px" }: Props) => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH={minH}>
      <VStack gap="4">
        <Spinner size="xl" color="teal.500" />
        <Text color="fg.muted">{message}</Text>
      </VStack>
    </Box>
  );
};
