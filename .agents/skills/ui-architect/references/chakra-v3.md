# Chakra UI v3 + プロジェクト固有ラッパー マッピング

`components.md` のカテゴリ → Chakra v3 / `src/components/ui/*` の具体実装。新規実装でゼロから作る前にここを必ず確認する。

## プロジェクト独自ラッパー（`src/components/ui/`）

| ラッパー | 役割 | 主要API（簡易） |
|---|---|---|
| `Button` / `IconButton` | Chakra Buttonの薄いプロジェクト入口 | `<Button colorPalette="teal" />` / `<IconButton aria-label="..." />` |
| `Select` | カスタムSelect | `<Select items={[...] as SelectItemType[]} value={...} onChange={...} usePortal={false} />` |
| `Dialog` | モーダルダイアログ | `useDialog()` + `<Dialog ... actionLayout mobileActionLayout mobileFullScreen />` |
| `DialogActionArea` | custom footerのDOM順とPC/SP配置 | `<DialogActionArea layout="flow" mobileLayout="stacked" startAction={...} endAction={...} />` |
| `StepperDialog` | 多段フロー用Dialog | `<StepperDialog><StepperDialogContent ... /></StepperDialog>` |
| `Empty` | 空状態 | `<Empty icon title description action minH />` |
| `ShiftoriLoading` | ロゴ付きローディング | `<ShiftoriLoading variant="section" />` |
| `FullPageSpinner` | ページ全体スピナー | `<FullPageSpinner />`（最後の手段） |
| `ErrorBoundary` | レンダリングエラー境界 | `<ErrorBoundary>{...}</ErrorBoundary>` |
| `Tour` | プロダクトツアー（react-joyride） | `<Tour steps={...} />` |
| `toaster.tsx` | Toast表示 | `toaster.create({ title, description, type })` |
| `tooltip.tsx` | Tooltip | `<Tooltip content="..." />` |

**新規UI作る前に**：上記にカバーされる用途なら自作禁止。同じカテゴリで足りないバリアントが必要なら、ラッパーを拡張する。

現状の `src/components/ui/` には専用 `BottomSheet` ラッパーは確認できない。
モバイルで重いDialogが必要な場合は、`Dialog`の`mobileFullScreen`または既定で全画面になる`StepperDialog`を使う。

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
| custom action配置 | `<DialogActionArea />` (`src/components/ui/Dialog`) |
| モバイル全画面Dialog | `Dialog mobileFullScreen`。`StepperDialog`は既定で全画面 |
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
- 低階調tealの面にicon・avatarの低階調teal背景を重ねる場合 → 内側を外側より1段以上濃くし、hover時にも同化させない
- action button、Accordion、DateRail、日付sort、週選択、シフト割当toggleの背景・hover → white、grayの低階調、blackAlpha、または中立semantic token。Buttonで実装されたselection cardは背景fillの例外
- クリック可能なrowの背景・hover → 原則として中立色。Dashboardのスタッフ一覧と、組織設定・店舗詳細・スタッフ詳細でスタッフや店舗を開くdrilldown list cardは、管理者rowの背景とlist card全体のhover背景に`teal.50`〜`teal.400`を使える
- Dashboardの募集一覧 → card rootはwhiteに保ち、状態はaccent、badge、必要なborderで示す
- 操作面のselected、active、割当済み → tealで強調する場合は背景を`teal.500`以上、文字・iconをwhiteにする
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
const dialog = useDialog();

<Dialog
  title="スタッフ情報を変更"
  isOpen={dialog.isOpen}
  onOpenChange={dialog.onOpenChange}
  onClose={dialog.close}
  formId="staff-form"
  submitLabel="変更を保存"
  isLoading={isSaving}
>
  <form id="staff-form" onSubmit={handleSubmit(onSubmit)}>
    {/* 入力項目 */}
  </form>
</Dialog>
```

既定footerは、Secondaryの「キャンセル」とPrimaryの完了操作をDOM順に並べ、デスクトップでは右側へまとめる。
submitのない閲覧用Dialogでは、Secondaryの「閉じる」を最終アクション位置へ自動で置く。
`isLoading`はsubmitの処理中表示と全close経路のlockをまとめて適用する。
submit以外の遷移を一時的にlockする必要がある場合だけ`preventClose`を使う。

custom footerが必要な場合も、配置用の`Flex`をfeatureで組まず`DialogActionArea`を使う。

```tsx
<Dialog
  title="変更内容を確認"
  isOpen={dialog.isOpen}
  onOpenChange={dialog.onOpenChange}
  onClose={dialog.close}
  footer={
    <DialogActionArea
      layout="flow"
      mobileLayout="stacked"
      startAction={
        <Button variant="outline" onClick={onBack}>
          戻る
        </Button>
      }
      endAction={<Button onClick={onSave}>変更を保存</Button>}
    />
  }
>
  {/* 確認内容 */}
</Dialog>
```

意味、文言、PC/SP配置、close lockは[UI設計方針の「Dialogのアクション」](../../../../doc/rules/ui-design.md#dialogのアクション)を正本とする。

### モバイル全画面Dialog

```tsx
<Dialog
  title="スタッフ詳細"
  isOpen={dialog.isOpen}
  onOpenChange={dialog.onOpenChange}
  onClose={dialog.close}
  closeLabel="閉じる"
  mobileFullScreen
  maxW="640px"
  maxH="85dvh"
>
  <Select items={items} usePortal={false} />
</Dialog>
```

`mobileFullScreen`はモバイルのVisual Viewport、全画面寸法、header/footerのsafe area、本文scrollをまとめて設定する。
同じ値を`contentProps`へ重ねて指定しない。

### StepperDialog

```tsx
<StepperDialog
  title="店舗設定"
  isOpen={dialog.isOpen}
  onOpenChange={dialog.onOpenChange}
  onClose={dialog.close}
>
  <StepperDialogContent
    steps={steps}
    currentStep={currentStep}
    actions={
      <>
        <Button variant="outline" onClick={onBack}>
          戻る
        </Button>
        <Button onClick={onNext}>次へ</Button>
      </>
    }
  >
    {/* 現在の段階 */}
  </StepperDialogContent>
</StepperDialog>
```

`actions`はSecondary、PrimaryまたはDestructiveのDOM順で渡す。
短い二操作は既定の`mobileActionLayout="inline"`、320px幅で一行に収まらない長い二操作は`mobileActionLayout="stacked"`を`StepperDialogContent`へ指定する。
`StepperDialog`がモバイル全画面、本文scroll、action bar、safe areaを所有するため、featureで同じレイアウトを重ねない。

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

StorybookのBehavior TestとVRTの分担、代表状態、ローカル実行方針は[テスト方針](../../../../doc/rules/testing-strategy.md)と`test-strategy`を正本とする。
