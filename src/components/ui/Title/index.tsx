import { Box, Button, Flex, Icon, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft } from "react-icons/lu";

type Props = {
  children: string | React.ReactNode;
  prev?: {
    url: string;
    label: string;
  };
  action?: React.ReactNode;
};
export const Title = ({ children, prev, action }: Props) => {
  return (
    <Box>
      {prev && (
        <Link to={prev.url}>
          <Button variant="ghost" p={1} color="gray.600" _hover={{ color: "gray.900" }} mb={1}>
            <Icon as={LuChevronLeft} boxSize={4} mr={1} />
            {prev.label}
          </Button>
        </Link>
      )}
      <Box mb={{ base: 4, md: 6 }}>
        <Flex align="center" justify="space-between" mb="2">
          <Box>
            {typeof children === "string" ? (
              <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" as="h2">
                {children}
              </Text>
            ) : (
              children
            )}
          </Box>
          {action}
        </Flex>
      </Box>
    </Box>
  );
};
