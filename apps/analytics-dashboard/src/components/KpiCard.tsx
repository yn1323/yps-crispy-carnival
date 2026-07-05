import { Box, Flex, Skeleton, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type KpiCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  accent?: "teal" | "blue" | "green" | "orange" | "gray";
  isLoading?: boolean;
};

const accentColor = {
  blue: "blue.500",
  gray: "gray.400",
  green: "green.500",
  orange: "orange.500",
  teal: "teal.500",
};

export const KpiCard = ({ label, value, helper, accent = "teal", isLoading = false }: KpiCardProps) => {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" minH="120px" p={4}>
      <Flex align="start" justify="space-between" gap={3}>
        <Text color="gray.600" fontSize="sm" fontWeight="bold">
          {label}
        </Text>
        <Box bg={accentColor[accent]} borderRadius="full" h="8px" mt="6px" w="8px" />
      </Flex>
      {isLoading ? (
        <Skeleton h="36px" mt={4} w="72%" />
      ) : (
        <Text color="gray.950" fontSize="3xl" fontWeight="bold" lineHeight="1.1" mt={3}>
          {value}
        </Text>
      )}
      {helper ? (
        <Text color="gray.500" fontSize="xs" mt={3}>
          {helper}
        </Text>
      ) : null}
    </Box>
  );
};
