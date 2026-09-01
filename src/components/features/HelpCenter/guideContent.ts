import {
  createMdxImageSrcResolver,
  createMdxVideoSrcResolver,
  type MdxComponent,
  type MdxTocItem,
} from "@/src/lib/mdx";
import { type GuideMetadata, getGuideMeta, guideMetas, helpIdFromPath } from "./helpMeta";

/** 使い方の本文層。各slugの本文・目次・画像・動画は、その詳細画面を開いたときだけ読み込む。 */
export type HelpGuideContent = {
  meta: GuideMetadata;
  Content: MdxComponent;
  toc: MdxTocItem[];
  resolveImageSrc: (src: string) => string;
  resolveVideoSrc: (src: string) => string;
};

type AsyncLoader<T> = () => Promise<T>;

const guideComponentLoaders: Record<string, AsyncLoader<MdxComponent>> = import.meta.glob<MdxComponent>(
  ["./content/guides/*.mdx", "!./content/guides/_*.mdx"],
  {
    query: "?mdx-component",
    import: "default",
  },
);

const guideTocLoaders: Record<string, AsyncLoader<MdxTocItem[]>> = import.meta.glob<MdxTocItem[]>(
  ["./content/guides/*.mdx", "!./content/guides/_*.mdx"],
  {
    query: "?mdx-toc",
    import: "default",
  },
);

const guideImageLoaders: Record<string, AsyncLoader<string>> = import.meta.glob<string>(
  ["./content/images/**/*.{avif,gif,jpeg,jpg,png,svg,webp}", "!./content/images/_*/**"],
  {
    query: "?url",
    import: "default",
  },
);

const guideVideoLoaders: Record<string, AsyncLoader<string>> = import.meta.glob<string>(
  ["./content/videos/**/*.{mp4,webm}", "!./content/videos/_*/**"],
  {
    query: "?url",
    import: "default",
  },
);

assertGuideLoaderPaths(guideComponentLoaders, guideTocLoaders, guideMetas);

export async function loadGuideContent(slug?: string): Promise<HelpGuideContent | undefined> {
  const meta = getGuideMeta(slug);
  if (!meta) return undefined;

  const documentPath = guideDocumentPath(meta.id);
  const componentLoader = guideComponentLoaders[documentPath];
  const tocLoader = guideTocLoaders[documentPath];
  if (!componentLoader) throw new Error(`使い方「${meta.id}」のMDX本文が見つかりません`);
  if (!tocLoader) throw new Error(`使い方「${meta.id}」の目次が見つかりません`);

  const [Content, toc, imageModules, videoModules] = await Promise.all([
    componentLoader(),
    tocLoader(),
    loadGuideImages(meta.id, guideImageLoaders),
    loadGuideVideos(meta.id, guideVideoLoaders),
  ]);

  return {
    meta,
    Content,
    toc,
    resolveImageSrc: createMdxImageSrcResolver(documentPath, imageModules),
    resolveVideoSrc: createMdxVideoSrcResolver(documentPath, videoModules),
  };
}

export function assertGuideLoaderPaths(
  componentLoaders: Readonly<Record<string, AsyncLoader<MdxComponent>>>,
  tocLoaders: Readonly<Record<string, AsyncLoader<MdxTocItem[]>>>,
  metadata: readonly GuideMetadata[],
): void {
  const expectedPaths = new Set(metadata.map((meta) => guideDocumentPath(meta.id)));

  for (const path of Object.keys(componentLoaders)) {
    const id = helpIdFromPath(path, "guide");
    if (!expectedPaths.has(path)) throw new Error(`使い方「${id}」のメタデータが見つかりません`);
    if (!Object.hasOwn(tocLoaders, path)) throw new Error(`使い方「${id}」の目次が見つかりません`);
  }

  for (const path of Object.keys(tocLoaders)) {
    const id = helpIdFromPath(path, "guide");
    if (!Object.hasOwn(componentLoaders, path)) throw new Error(`使い方「${id}」のMDX本文が見つかりません`);
  }

  for (const meta of metadata) {
    const path = guideDocumentPath(meta.id);
    if (!Object.hasOwn(componentLoaders, path)) throw new Error(`使い方「${meta.id}」のMDX本文が見つかりません`);
  }
}

async function loadGuideImages(
  guideId: string,
  imageLoaders: Readonly<Record<string, AsyncLoader<string>>>,
): Promise<Record<string, string>> {
  const directoryPrefix = `./content/images/${guideId}/`;
  const entries = Object.entries(imageLoaders).filter(([path]) => path.startsWith(directoryPrefix));
  return Object.fromEntries(await Promise.all(entries.map(async ([path, loader]) => [path, await loader()])));
}

async function loadGuideVideos(
  guideId: string,
  videoLoaders: Readonly<Record<string, AsyncLoader<string>>>,
): Promise<Record<string, string>> {
  const directoryPrefix = `./content/videos/${guideId}/`;
  const entries = Object.entries(videoLoaders).filter(([path]) => path.startsWith(directoryPrefix));
  return Object.fromEntries(await Promise.all(entries.map(async ([path, loader]) => [path, await loader()])));
}

function guideDocumentPath(id: string): string {
  return `./content/guides/${id}.mdx`;
}
