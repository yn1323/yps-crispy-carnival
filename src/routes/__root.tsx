import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "@/src/components/ui/toaster";
import { sendPageView } from "@/src/lib/gtm";
import { buildMeta, jsonLdMeta } from "@/src/lib/seo";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const SITE_DESCRIPTION =
  "LINEでスタッフにシフト希望を依頼し、提出状況の確認からシフト作成・確定共有まで進められます。\nスタッフはアプリ不要で、そのまま希望シフトを提出できます。";

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "シフトリ",
  description: SITE_DESCRIPTION,
  url: "https://shiftori.app",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  image: "https://shiftori.app/ogp.png",
  inLanguage: "ja",
  provider: {
    "@type": "Organization",
    name: "シフトリ",
    url: "https://shiftori.app",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "シフトリ",
  url: "https://shiftori.app",
  logo: "https://shiftori.app/logo512.png",
};

const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "シフトリ",
  url: "https://shiftori.app",
  inLanguage: "ja-JP",
};

const PageViewTracker = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    sendPageView(pathname);
  }, [pathname]);

  return null;
};

const HydrationReadyMarker = () => {
  useEffect(() => {
    // SSR本文が見えた段階と、操作できる段階をPreview smokeで区別する。
    document.documentElement.dataset.appHydrated = "true";
  }, []);

  return null;
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, interactive-widget=resizes-content",
      },
      { name: "theme-color", content: "#000000" },
      ...buildMeta({
        title: "シフトリ｜LINEでシフト希望を集める無料シフト管理ツール",
        description: SITE_DESCRIPTION,
      }),
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "シフトリ" },
      { property: "og:image", content: "https://shiftori.app/ogp.png" },
      { property: "og:image:secure_url", content: "https://shiftori.app/ogp.png" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "シフトリのロゴ" },
      { property: "og:locale", content: "ja_JP" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://shiftori.app/ogp.png" },
      { name: "twitter:image:alt", content: "シフトリのロゴ" },
      ...jsonLdMeta(softwareApplicationJsonLd),
      ...jsonLdMeta(organizationJsonLd),
      ...jsonLdMeta(webSiteJsonLd),
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", href: "/logo192.png", sizes: "192x192" },
      { rel: "icon", type: "image/png", href: "/logo512.png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/logo192.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  return (
    <ChakraProvider>
      <PageViewTracker />
      <HydrationReadyMarker />
      <Outlet />
      <Toaster />
    </ChakraProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
