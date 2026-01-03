import { Card, Flex, Heading, Icon } from "@chakra-ui/react";
import type { IconType } from "react-icons";

type FormCardProps = {
  icon: IconType;
  iconColor?: string;
  title: string;
  children: React.ReactNode;
  rightElement?: React.ReactNode;
};

export const FormCard = ({ icon, iconColor = "gray.700", title, children, rightElement }: FormCardProps) => {
  return (
    <Card.Root w="full" borderWidth={0} shadow="sm">
      <Card.Body p={{ base: 4, md: 6 }}>
        <Flex align="center" justify="space-between" mb={4}>
          <Flex align="center" gap={2}>
            <Icon as={icon} boxSize={4} color={iconColor} />
            <Heading as="h3" size="md" color="gray.900">
              {title}
            </Heading>
          </Flex>
          {rightElement}
        </Flex>
        {children}
      </Card.Body>
    </Card.Root>
  );
};
