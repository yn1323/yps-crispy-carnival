import { Heading, Stack } from "@chakra-ui/react";

type Props = {
  title: string;
  children: React.ReactNode;
};

export const TitleTemplate = ({ title, children }: Props) => {
  return (
    <Stack gap="6" w="full">
      <Heading size="xl">{title}</Heading>
      {children}
    </Stack>
  );
};
