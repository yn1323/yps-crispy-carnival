import { Box, type BoxProps, Flex, Skeleton, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type ChartPanelProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
  contentHeight?: BoxProps["h"];
};

export const ChartPanel = ({
  title,
  description,
  action,
  children,
  isLoading = false,
  contentHeight = "280px",
}: ChartPanelProps) => {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" p={4}>
      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={3}
        justify="space-between"
      >
        <Box>
          <Text color="gray.950" fontSize="md" fontWeight="bold">
            {title}
          </Text>
          {description ? (
            <Text color="gray.500" fontSize="sm" mt={1}>
              {description}
            </Text>
          ) : null}
        </Box>
        {action}
      </Flex>
      <Box h={contentHeight} mt={4} minW={0}>
        {isLoading ? <Skeleton h="full" w="full" /> : children}
      </Box>
    </Box>
  );
};
