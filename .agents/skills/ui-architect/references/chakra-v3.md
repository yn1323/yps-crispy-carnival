# Chakra UI v3 + プロジェクト固有ラッパー マッピング

`components.md` のカテゴリ → Chakra v3 / `src/components/ui/*` の具体実装。新規実装でゼロから作る前にここを必ず確認する。

## プロジェクト独自ラッパー（`src/components/ui/`）

| ラッパー | 役割 | 主要API（簡易） |
|---|---|---|
| `Select` | カスタムSelect | `<Select items={[...] as SelectItemType[]} value={...} onChange={...} usePortal={false} />` |
| `Dialog` | モーダルダイアログ | `useDialog()` フック + `<Dialog open onClose />` |
| `BottomSheet` | モバイルBottomSheet | `useBottomSheet()` フック + `<BottomSheet open onClose />` |
| `FormCard` | フォームのカード単位 | `<FormCard icon title rightElement>{...}</FormCard>` |
| `Empty` | 空状態 | `<Empty icon title description action minH />` |
| `LoadingState` | ローディング表示 | `<LoadingState />` |
| `FullPageSpinner` | ページ全体スピナー | `<FullPageSpinner />`（最後の手段） |
| `ErrorBoundary` | レンダリングエラー境界 | `<ErrorBoundary>{...}</ErrorBoundary>` |
| `Title` | ページ/セクションタイトル | `<Title>...</Title>` |
| `InfoGuide` | ヘルプ・案内ボックス | `<InfoGuide>...</InfoGuide>` |
| `LazyShow` | 遅延表示・スムーズ出現 | `<LazyShow>{...}</LazyShow>` |
| `Tour` | プロダクトツアー（react-joyride） | `<Tour steps={...} />` |
| `BrowserMockup` | ブラウザ枠UI（デモ・LP用） | `<BrowserMockup>{...}</BrowserMockup>` |
| `ColorPicker` | カラー選択 | `<ColorPicker value onChange />` |
| `toaster.tsx` | Toast表示 | `toaster.create({ title, description, type })` |
| `tooltip.tsx` | Tooltip | `<Tooltip content="..." />` |

**新規UI作る前に**：上記にカバーされる用途なら自作禁止。同じカテゴリで足りないバリアントが必要なら、ラッパーを拡張する。

## カテゴリ → 部品マッピング

### 入力（テキスト）

| カテゴリ | Chakra v3 / ラッパー |
|---|---|
| 短文 | `<Input />` |
| 長文 | `<Textarea autoresize />` |
| パスワード | `<PasswordInput />` (v3) or `<Input type="password" />` |
| 数値 | `<NumberInput.Root />` |
| 検索 | `<Input />` + `<InputGroup startElement={<LuSearch />} />` |
| トークン入力 | `<TagsInput />`（v3） |
| ピン入力（OTP） | `<PinInput />` |

### 選択

| 用途 | 部品 |
|---|---|
| 2〜3択全部見せ | `<SegmentGroup.Root />` |
| Radio | `<RadioGroup.Root />` |
| 単一選択（カスタム） | `<Select />` (`src/components/ui/Select`) |
| 複数選択 | `<CheckboxGroup>` or Combobox multi |
| Combobox / Autocomplete | `<Combobox.Root />`（v3） |
| Switch | `<Switch.Root />` |
| Checkbox | `<Checkbox.Root />` |
| Slider | `<Slider.Root />` |
| Color | `<ColorPicker />` (`src/components/ui/ColorPicker`) |
| Date | DatePicker（プロジェクト未統一の場合は要確認） |

**Select × モーダル/BottomSheet 内**：必ず `usePortal={false}` を渡す（Portalだとシート背後に出る）。

### コンテナ・モーダル

| 用途 | 部品 |
|---|---|
| ダイアログ | `<Dialog />` (`src/components/ui/Dialog`) + `useDialog()` |
| BottomSheet | `<BottomSheet />` (`src/components/ui/BottomSheet`) + `useBottomSheet()` |
| Drawer | `<Drawer.Root />`（Chakra v3） |
| Popover | `<Popover.Root />` |
| Menu | `<Menu.Root />` |
| Tooltip | `<Tooltip />` (`src/components/ui/tooltip.tsx`) |
| Toast | `toaster.create({ title, description, type: 'success' })` |

**BottomSheet 内ドロップダウン**：クリップ問題が出たら `overflowY="visible"` を追加。

### ボタン

| 用途 | 部品・props |
|---|---|
| Primary | `<Button colorPalette="teal" />` |
| Secondary | `<Button variant="outline" />` |
| Ghost | `<Button variant="ghost" />` |
| Destructive | `<Button colorPalette="red" />` |
| アイコンのみ | `<IconButton aria-label="..." />` |
| メニュートリガー | `<Menu.Trigger asChild><Button>...</Button></Menu.Trigger>` |

サイズ：`size="xs|sm|md|lg"`。タッチターゲットを確保するならモバイルは`md`以上。

### レイアウト

| 用途 | 部品 |
|---|---|
| Stack（縦） | `<VStack gap={4} align="stretch" />` |
| Stack（横） | `<HStack gap={2} />` |
| Flex（柔軟） | `<Flex gap direction />` |
| Grid | `<Grid templateColumns gap />` |
| 2カラム可変 | `<SimpleGrid columns={{ base: 1, md: 2 }} gap={4} />` |
| Container（中央寄せ） | `<Container maxW="640px" />` |
| Box（汎用） | `<Box />` |
| Spacer（伸縮） | `<Spacer />` |

### タイポ

| 用途 | 部品 |
|---|---|
| 見出し | `<Heading size="2xl" / "lg" />` |
| 本文 | `<Text fontSize="md" />` |
| メタ | `<Text fontSize="sm" color="gray.500" />` |

### 表示・ステータス

| 用途 | 部品 |
|---|---|
| Badge | `<Badge colorPalette="green" />` |
| Tag | `<Tag.Root />` |
| アバター | `<Avatar.Root />` |
| 区切り線 | `<Separator />` |
| アイコン | `react-icons/lu` 等（既存踏襲） |

### データ表示

| 用途 | 部品 |
|---|---|
| Table | `<Table.Root />` + `<Table.Header />` 等 |
| List | `<VStack>` + 行コンポーネント |
| Card | 自前 or `<Card.Root />` |
| Tabs | `<Tabs.Root />` |
| Accordion | `<Accordion.Root />` |
| Steps | `<Steps.Root />` |

### 状態

| 用途 | 部品 |
|---|---|
| Skeleton | `<Skeleton h="20px" />` |
| Spinner | `<Spinner />`（最後の手段） |
| Empty | `<Empty />` (`src/components/ui/Empty`) |
| Error表示 | 自前（インライン or Empty 流用） |
| Toast | `toaster.create({ ... })` |
| Banner | `<Alert.Root status="info" />` |
| Progress | `<Progress.Root />` |

## カラートークン

```
teal   → ブランド・主アクション（colorPalette="teal"）
orange → 要対応・警告
green  → 達成・完了
gray   → 中立・完了済み・非アクティブ
red    → 削除・致命エラー
yellow → ほぼ未使用
```

色シェード（一般的な使い分け）：
- `50` → 背景・薄いタグ
- `100` → 背景・selected状態
- `500` → ボタン背景・主要テキスト on white
- `700` → ホバー時・濃いめテキスト
- `900` → 主要文字色

## スペーシングトークン

Chakra v3 の数値プロパティ（`p={4}` = 16px）:
| token | px |
|---|---|
| 1 | 4 |
| 2 | 8 |
| 3 | 12 |
| 4 | 16 |
| 5 | 20 |
| 6 | 24 |
| 8 | 32 |
| 10 | 40 |
| 12 | 48 |
| 16 | 64 |
| 20 | 80 |
| 24 | 96 |

## レスポンシブ

```tsx
<Box
  p={{ base: 4, md: 6, lg: 8 }}
  fontSize={{ base: "md", md: "lg" }}
/>
```

ブレークポイント：`base / sm / md / lg / xl / 2xl`。

## アニメーション

- マイクロアニメは200ms以内
- `prefers-reduced-motion` に従う（`@media`）
- 大きな装飾アニメは1画面1つ

## 良くあるレシピ

### フォーム + Submit

```tsx
<form onSubmit={handleSubmit(onSubmit)}>
  <VStack gap={4} align="stretch">
    <Field.Root invalid={!!errors.name}>
      <Field.Label>氏名</Field.Label>
      <Input {...register("name")} />
      <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
    </Field.Root>
    {/* ... */}
    <Button type="submit" colorPalette="teal" loading={isSubmitting}>
      保存
    </Button>
  </VStack>
</form>
```

Submit常時enabled、エラーは押下時に表示（このプロジェクト規約）。

### Dialog（モーダル）

```tsx
const { open, onOpen, onClose } = useDialog();

<Dialog open={open} onClose={onClose} title="編集">
  <VStack gap={4} align="stretch">
    {/* フォーム */}
  </VStack>
</Dialog>
```

### BottomSheet（モバイル）

```tsx
const { open, onOpen, onClose } = useBottomSheet();

<BottomSheet open={open} onClose={onClose} title="編集">
  {/* Select 使うなら usePortal={false} */}
  <Select items={items} usePortal={false} />
</BottomSheet>
```

### Empty

```tsx
<Empty
  icon={<LuCalendarPlus />}
  title="まだシフトがありません"
  description="日付をタップして最初のシフトを登録しましょう"
  action={<Button onClick={onCreate}>シフトを登録</Button>}
/>
```

### Toast

```tsx
toaster.create({
  title: "保存しました",
  type: "success",
  duration: 4000,
});

toaster.create({
  title: "保存に失敗しました",
  description: "通信を確認してもう一度お試しください",
  type: "error",
  action: { label: "再試行", onClick: handleRetry },
});
```

### Skeleton（ローディング）

```tsx
{isLoading ? (
  <VStack gap={3} align="stretch">
    {[1, 2, 3].map(i => (
      <Skeleton key={i} h="80px" borderRadius="md" />
    ))}
  </VStack>
) : (
  <List items={data} />
)}
```

## 注意：Chakra v3 の v2 からの違い

- `colorScheme` → `colorPalette`
- `isDisabled` → `disabled`
- `isLoading` → `loading`
- `Box as="button"` のような `as` propは廃止 → 専用コンポーネント
- compound component pattern（`Dialog.Root` / `Dialog.Trigger` / ...）が標準
- `<ChakraProvider value={system}>` で system を渡す

過去の v2 知識でコードを書くと動かない。v3 ドキュメント参照、または既存コードを倣う。

## Storybook 連携

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta: Meta<typeof MyComponent> = {
  component: MyComponent,
};
export default meta;
type Story = StoryObj<typeof MyComponent>;

export const Default: Story = {
  args: { onClick: () => {} }, // fn() 使わない
};
export const Loading: Story = { args: { isLoading: true } };
export const Empty: Story = { args: { items: [] } };
export const Error: Story = { args: { error: new Error("...") } };
```

小さなコンポーネントは Variants Story 1つにまとめる（VRT節約）。複雑な動きは Interactive Story 別途。
