import { Box, Flex, Text } from "@chakra-ui/react";

type Props = {
  unsubmittedNames: string[];
  deadline: string;
  linkExpiresAtLabel: string;
};

export const RemindUnsubmittedContent = ({ unsubmittedNames, deadline, linkExpiresAtLabel }: Props) => {
  return (
    <>
      <Text fontSize="sm" lineHeight="tall" mb={4}>
        未提出 {unsubmittedNames.length}名に提出のお願いを送ります。
      </Text>
      <Box bg="gray.50" borderRadius="md" p={4} mb={4}>
        <Text fontSize="sm" mb={2} color="gray.700">
          提出締切: {deadline}
        </Text>
        <Flex gap={2} wrap="wrap">
          {unsubmittedNames.map((name) => (
            <Box
              key={name}
              fontSize="xs"
              px={2}
              py="2px"
              bg="white"
              borderWidth="1px"
              borderColor="amber.200"
              borderRadius="full"
              color="amber.700"
            >
              {name}
            </Box>
          ))}
        </Flex>
      </Box>
      <Text fontSize="xs" color="gray.600">
        メール内のリンクは <strong>{linkExpiresAtLabel}</strong> まで有効です（送信から24時間）。
      </Text>
    </>
  );
};
