import { Badge, Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { IoChevronForwardSharp, IoTimeSharp } from "react-icons/io5";
import { LuStore } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";

type ShopSettingProps = {
  storeName: string;
  templateCount: number;
};

export const ShopSetting = ({ storeName, templateCount }: ShopSettingProps) => {
  return (
    <FormCard icon={LuStore} iconColor="gray.700" title="店舗別設定">
      <VStack gap="4" align="stretch">
        <Link to="/settings/shift-template">
          <Box
            bg="gray.50"
            borderRadius="lg"
            cursor="pointer"
            p={{ base: 4, md: 6 }}
            role="group"
            _hover={{ bg: "gray.100" }}
            transition="all 0.15s"
          >
            <Flex align="center" justify="space-between" gap="4">
              <Flex align="center" gap="3" flex="1">
                <Flex p="2" bg="teal.50" borderRadius="lg">
                  <Icon as={IoTimeSharp} boxSize={5} color="teal.600" />
                </Flex>
                <Box flex="1">
                  <Flex align="center" gap="2" mb="1">
                    <Text as="h4" color="gray.900">
                      よく使うシフト
                    </Text>
                    <Badge variant="outline" fontSize="xs">
                      {templateCount}件
                    </Badge>
                  </Flex>
                  <Text fontSize="xs" color="gray.600">
                    {storeName}でよく使うシフトを管理
                  </Text>
                </Box>
              </Flex>
              <Box
                color="gray.400"
                flexShrink="0"
                _groupHover={{ color: "teal.600", transform: "translateX(4px)" }}
                transition="all 0.15s"
              >
                <Icon as={IoChevronForwardSharp} boxSize={5} />
              </Box>
            </Flex>
          </Box>
        </Link>
      </VStack>
    </FormCard>
  );
};
