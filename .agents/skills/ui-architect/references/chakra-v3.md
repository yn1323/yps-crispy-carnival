# Chakra UI v3 + プロジェクト固有ラッパー マッピング

`components.md` のカテゴリ → Chakra v3 / `src/components/ui/*` の具体実装。新規実装でゼロから作る前にここを必ず確認する。

## プロジェクト独自ラッパー（`src/components/ui/`）

| ラッパー | 役割 | 主要API（簡易） |
|---|---|---|
| `Button` / `IconButton` | Chakra Buttonの薄いプロジェクト入口 | `<Button colorPalette="teal" />` / `<IconButton aria-label="..." />` |
| `Select` | カスタムSelect | `<Select items={[...] as SelectItemType[]} value={...} onChange={...} usePortal={false} />` |
| `Dialog` | モーダルダイアログ | `useDialog()` フック + `<Dialog isOpen={...} onOpenChange={...} onClose={...} />` |
| `StepperDialog` | 多段フロー用Dialog | `<StepperDialog><StepperDialogContent ... /></StepperDialog>` |
| `Empty` | 空状態 | `<Empty icon title description action minH />` |
| `ShiftoriLoading` | ロゴ付きローディング | `<ShiftoriLoading variant="section" />` |
| `FullPageSpinner` | ページ全体スピナー | `<FullPageSpinner />`（最後の手段） |
| `ErrorBoundary` | レンダリングエラー境界 | `<ErrorBoundary>{...}</ErrorBoundary>` |
| `Tour` | プロダクトツアー（react-joyride） | `<Tour steps={...} />` |
| `toaster.tsx` | Toast表示 | `toaster.create({ title, description, type })` |
| `tooltip.tsx` | Tooltip | `<Tooltip content="..." />` |

**新規UI作る前に**：上記にカバーされる用途なら自作禁止。同じカテゴリで足りないバリアントが必要なら、ラッパーを拡張する。

現状の `src/components/ui/` には専用 `BottomSheet` ラッパーは確認できない。モバイルで重いDialogが必要な場合は、既存実装に合わせて `Dialog` / `StepperDialog` を `100vw` / `100dvh` の全画面にする。

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
| Color | Chakra UIのColor Picker、または限定パレット（要件に合う方を選ぶ） |
| Date | DatePicker（プロジェクト未統一の場合は要確認） |

**Select × Dialog / StepperDialog 内**：Portalで背面や外側に出る場合は `usePortal={false}` を渡す。

### コンテナ・モーダル

| 用途 | 部品 |
|---|---|
| ダイアログ | `<Dialog />` (`src/components/ui/Dialog`) + `useDialog()` |
| 多段Dialog | `<StepperDialog />` (`src/components/ui/StepperDialog`) |
| モバイル全画面Dialog | `Dialog` / `StepperDialog` の `maxW`, `maxH`, `contentProps` で全画面化 |
| Drawer | `<Drawer.Root />`（Chakra v3） |
| Popover | `<Popover.Root />` |
| Menu | `<Menu.Root />` |
| Tooltip | `<Tooltip />` (`src/components/ui/tooltip.tsx`) |
| Toast | `toaster.create({ title, description, type: 'success' })` |

**Overlay内ドロップダウン**：クリップ問題が出たら `usePortal={false}` や `overflowY` を確認する。

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
orange → 要シフト調整・警告
green  → 達成・完了
gray   → 中立・完了済み・非アクティブ
red    → 削除・致命エラー
yellow → ほぼ未使用
```

色シェード（プロジェクト固有の使い分け）：
- `teal.50`〜`teal.400` → ページ、section、card、callout、icon、avatar、badge、selection card、カレンダーの日付範囲などの背景fillに限って使える。opacity suffixとgradientも背景fillなら同じ扱い
- action button、クリック可能なrow、Accordion、DateRail、日付sort、週選択、シフト割当toggleの背景・hover → white、grayの低階調、blackAlpha、または中立semantic token。Buttonで実装されたselection cardは背景fillの例外
- 通常border → `border.default`、強いborder → `border.emphasized`
- border、outline、focus ring、divider、progress connector、shadow、文字・iconのforegroundへtealを明示する場合 → `500`以上
- tealの主要文字 on white → `700`以上を基本にする
- 低階調tealの許可・禁止用途は、ルート`AGENTS.md`を正本とする

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

const dialog = useDialog();

<Dialog title="編集" isOpen={dialog.isOpen} onOpenChange={dialog.onOpenChange} onClose={dialog.close}>
  <VStack gap={4} align="stretch">
    {/* フォーム */}
  </VStack>
</Dialog>
```

### モバイル全画面Dialog

```tsx
<Dialog
  title="編集"
  isOpen={dialog.isOpen}
  onOpenChange={dialog.onOpenChange}
  onClose={dialog.close}
  maxW={{ base: "100vw", lg: "640px" }}
  maxH={{ base: "100dvh", lg: "85dvh" }}
  contentProps={{
    w: "100%",
    h: { base: "100dvh", lg: "auto" },
    my: { base: 0, lg: "auto" },
    borderRadius: { base: 0, lg: "l3" },
  }}
>
  <Select items={items} usePortal={false} />
</Dialog>
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
