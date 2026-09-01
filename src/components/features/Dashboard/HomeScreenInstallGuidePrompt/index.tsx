import { Flex, Link } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuExternalLink, LuX } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { isStandaloneWebApp, STANDALONE_DISPLAY_QUERY } from "@/src/lib/pwaDisplayMode";

export const HOME_SCREEN_INSTALL_GUIDE_DISMISSAL_STORAGE_KEY =
  "shiftori-dashboard-home-screen-install-guide-dismissed:v1";

const HOME_SCREEN_INSTALL_GUIDE_PATH = "/help/open-shiftori-from-home-screen";
const MOBILE_VIEWPORT_QUERY = "(max-width: 1023px)";

export function HomeScreenInstallGuidePrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const dismissedInSessionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mobileViewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const standaloneDisplay = window.matchMedia(STANDALONE_DISPLAY_QUERY);

    const updateVisibility = () => {
      setIsVisible(
        !dismissedInSessionRef.current &&
          mobileViewport.matches &&
          !isStandaloneWebApp(standaloneDisplay.matches, window.navigator) &&
          !readDismissedState(),
      );
    };

    updateVisibility();
    mobileViewport.addEventListener("change", updateVisibility);
    standaloneDisplay.addEventListener("change", updateVisibility);

    return () => {
      mobileViewport.removeEventListener("change", updateVisibility);
      standaloneDisplay.removeEventListener("change", updateVisibility);
    };
  }, []);

  const handleDismiss = () => {
    dismissedInSessionRef.current = true;
    setIsVisible(false);
    writeDismissedState();
  };

  if (!isVisible) return null;

  return <HomeScreenInstallGuidePromptView onDismiss={handleDismiss} />;
}

export function HomeScreenInstallGuidePromptView({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Flex w="full" align="center" justify="flex-end" gap={1}>
      <Link
        href={HOME_SCREEN_INSTALL_GUIDE_PATH}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="ホーム画面にシフトリを追加する（別タブで開きます）"
        minH="44px"
        display="inline-flex"
        alignItems="center"
        justifyContent="flex-end"
        gap={1}
        color="teal.700"
        fontSize="sm"
        fontWeight="semibold"
        lineHeight="short"
        textAlign="right"
        textDecoration="underline"
        textUnderlineOffset="3px"
      >
        ホーム画面にシフトリを追加する
        <LuExternalLink aria-hidden="true" focusable="false" size={14} />
      </Link>
      <IconButton
        aria-label="ホーム画面への追加案内を閉じる"
        variant="ghost"
        colorPalette="gray"
        minW="44px"
        minH="44px"
        flexShrink={0}
        onClick={onDismiss}
      >
        <LuX />
      </IconButton>
    </Flex>
  );
}

function readDismissedState(): boolean {
  try {
    return window.localStorage.getItem(HOME_SCREEN_INSTALL_GUIDE_DISMISSAL_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function writeDismissedState(): void {
  try {
    window.localStorage.setItem(HOME_SCREEN_INSTALL_GUIDE_DISMISSAL_STORAGE_KEY, "dismissed");
  } catch {
    // 保存できない環境でも、現在の画面では閉じた状態を保つ。
  }
}
