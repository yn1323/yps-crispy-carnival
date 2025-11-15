import { Badge, Box, Card, Flex, Heading, Icon, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { Animation } from "@/src/components/templates/Animation";
import { convertRole } from "@/src/helpers/domain/convertShopData";

type ShopWithRoles = Doc<"shops"> & {
  roles: string[];
};

type InfoTabProps = {
  shops: ShopWithRoles[];
};

export const InfoTab = ({ shops }: InfoTabProps) => {
  return (
    <Animation>
      <Card.Root borderWidth={0} shadow="sm">
        <Card.Body p={{ base: 4, md: 6 }}>
          <Heading as="h4" size="md" color="gray.900" mb={4}>
            所属店舗一覧
          </Heading>
          {shops.length > 0 ? (
            <Box>
              {shops.map((shop, index) => (
                <Box key={shop._id}>
                  <Flex align="center" justify="space-between" p={3} bg="gray.50" borderRadius="lg">
                    <Flex align="center" gap={3}>
                      <Flex p={2} bg="white" borderRadius="lg">
                        <Icon as={LuStore} boxSize={4} color="teal.600" />
                      </Flex>
                      <Text fontSize="sm" color="gray.900">
                        {shop.shopName}
                      </Text>
                    </Flex>
                    <Flex gap={2}>
                      {shop.roles.map((role) => (
                        <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm">
                          {convertRole.toLabel(role)}
                        </Badge>
                      ))}
                    </Flex>
                  </Flex>
                  {index < shops.length - 1 && <Box h={3} />}
                </Box>
              ))}
            </Box>
          ) : (
            <Text color="gray.500" textAlign="center" py={4}>
              所属店舗がありません
            </Text>
          )}
        </Card.Body>
      </Card.Root>
    </Animation>
  );
};
