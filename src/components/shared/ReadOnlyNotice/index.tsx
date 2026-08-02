import { Alert } from "@chakra-ui/react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description: ReactNode;
  borderRadius?: "lg" | "xl";
};

export function ReadOnlyNotice({ title, description, borderRadius = "xl" }: Props) {
  return (
    <Alert.Root status="warning" borderRadius={borderRadius} alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description whiteSpace="pre-line">{description}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
