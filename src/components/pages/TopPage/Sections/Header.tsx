import { Box, Button, Container, Flex, HStack, Icon, Link, Text, VStack } from "@chakra-ui/react";
import { SignInButton } from "@clerk/clerk-react";
import { AiOutlineCalendar } from "react-icons/ai";
import { HiMenu } from "react-icons/hi";

const navItems = [
  { name: "機能", href: "#features" },
  { name: "ターゲット", href: "#target" },
];

type Props = {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
};

export const Header = ({ isMenuOpen, onToggleMenu }: Props) => {
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="50"
      w="full"
      borderBottom="1px"
      borderColor="gray.200"
      bg="white"
      backdropFilter="blur(10px)"
    >
      <Container maxW="7xl">
        <Flex h="16" align="center" justify="space-between">
          {/* Logo */}
          <HStack gap="2">
            <Flex w="8" h="8" bg="teal.600" borderRadius="lg" align="center" justify="center">
              <Icon as={AiOutlineCalendar} boxSize="5" color="white" />
            </Flex>
            <Text color="gray.900">ShiftHub</Text>
          </HStack>

          {/* Desktop Navigation */}
          <HStack gap="6" display={{ base: "none", md: "flex" }}>
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                fontSize="sm"
                color="gray.600"
                _hover={{ color: "gray.900" }}
                transition="colors 0.15s"
              >
                {item.name}
              </Link>
            ))}
          </HStack>

          {/* Right side - Login button */}
          <HStack gap="4">
            <SignInButton forceRedirectUrl="/mypage">
              <Button variant="outline" display={{ base: "none", sm: "flex" }}>
                ログイン
              </Button>
            </SignInButton>
            {/* Mobile menu button */}
            <Button display={{ base: "flex", md: "none" }} variant="ghost" p="2" onClick={onToggleMenu}>
              <Icon as={HiMenu} boxSize="6" />
            </Button>
          </HStack>
        </Flex>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <Box display={{ base: "block", md: "none" }} py="4" borderTop="1px" borderColor="gray.200">
            <VStack gap="4" align="stretch">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  fontSize="sm"
                  color="gray.600"
                  _hover={{ color: "gray.900" }}
                  transition="colors 0.15s"
                  onClick={onToggleMenu}
                >
                  {item.name}
                </Link>
              ))}
              <Button variant="outline" w="full" display={{ base: "flex", sm: "none" }}>
                ログイン
              </Button>
            </VStack>
          </Box>
        )}
      </Container>
    </Box>
  );
};
