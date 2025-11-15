import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft } from "react-icons/lu";

type Props = {
  text: string;
  prev?: {
    url: string;
    label: string;
  };
  action?: React.ReactNode;
};
export const Title = ({ text, prev, action }: Props) => {
  return (
    <Box>
      {prev && (
        <Link to={prev.url}>
          <Button variant="ghost" ml={-4} color="gray.600" _hover={{ color: "gray.900" }} mb={1}>
            <LuChevronLeft size={16} />
            {prev.label}
          </Button>
        </Link>
      )}
      <Box mb={{ base: 4, md: 6 }}>
        <Flex align="center" justify="space-between" mb="2">
          <Box>
            <Text as="h2" color="gray.900" mb="1" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
              {text}
            </Text>
          </Box>
          {action}
        </Flex>
      </Box>
    </Box>
  );
};
