import { Box } from "@chakra-ui/react";
import { useState } from "react";
import { resetUserAtom } from "@/src/stores/user";
import { CTASection } from "./Sections/CTASection";
import { FeaturesSection } from "./Sections/FeaturesSection";
import { Footer } from "./Sections/Footer";
import { Header } from "./Sections/Header";
import { HeroSection } from "./Sections/HeroSection";
import { ProblemsSection } from "./Sections/ProblemsSection";
import { TargetUsersSection } from "./Sections/TargetUsersSection";

export const TopPage = () => {
  resetUserAtom();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleToggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <Box minH="100vh" bg="white">
      <Header isMenuOpen={isMenuOpen} onToggleMenu={handleToggleMenu} />
      <HeroSection />
      <ProblemsSection />
      <FeaturesSection />
      <TargetUsersSection />
      <CTASection />
      <Footer />
    </Box>
  );
};
