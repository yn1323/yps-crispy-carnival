import { EmptyState, Icon } from "@chakra-ui/react";

type Props = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  minH?: string;
};

export const Empty = ({ icon, title, description, action, minH = "400px" }: Props) => {
  return (
    <EmptyState.Root minH={minH}>
      <EmptyState.Content>
        {icon && (
          <EmptyState.Indicator>
            <Icon as={icon} />
          </EmptyState.Indicator>
        )}
        <EmptyState.Title>{title}</EmptyState.Title>
        {description && <EmptyState.Description>{description}</EmptyState.Description>}
        {action}
      </EmptyState.Content>
    </EmptyState.Root>
  );
};
