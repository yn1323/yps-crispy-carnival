# タブ状態のURL同期（QueryString）実装計画

## 目的
タブの選択状態をURLのクエリパラメータ（QueryString）として保持し、ページ遷移やリロードを行ってもタブの状態が維持されるようにします。
これにより、「タブを変更→遷移→戻るボタン押下」のフローでタブが初期状態に戻ってしまう問題を解決します。

## User Review Required
- 特になし

## Proposed Changes

### Routes

#### [MODIFY] [src/routes/_auth/shops/$shopId/invite/index.tsx](file:///c:/Users/yn132/work/yps-crispy-carnival/src/routes/_auth/shops/$shopId/invite/index.tsx)
- `zod` スキーマを定義し、`tab` パラメータ（`send` | `manage` | `staff`）を受け入れるようにします。
- `validateSearch` オプションを追加します。

#### [MODIFY] [src/routes/_auth/shops/$shopId/index.tsx](file:///c:/Users/yn132/work/yps-crispy-carnival/src/routes/_auth/shops/$shopId/index.tsx)
- `zod` スキーマを定義し、`tab` パラメータ（`info` | `staff`）を受け入れるようにします。
- `validateSearch` オプションを追加します。

### Components

#### [MODIFY] [src/components/features/Shop/Invite/index.tsx](file:///c:/Users/yn132/work/yps-crispy-carnival/src/components/features/Shop/Invite/index.tsx)
- `useSearch` フックを使用して現在の `tab` の値を取得します。
- `useNavigate` フックを使用してタブ変更時にURLを更新します。
- `Tabs.Root` を非制御（`defaultValue`）から制御（`value` + `onValueChange`）に変更します。

#### [MODIFY] [src/components/features/Shop/ShopDetail/index.tsx](file:///c:/Users/yn132/work/yps-crispy-carnival/src/components/features/Shop/ShopDetail/index.tsx)
- `useSearch` フックを使用して現在の `tab` の値を取得します。
- `useNavigate` フックを使用してタブ変更時にURLを更新します。
- `Tabs.Root` を非制御（`defaultValue`）から制御（`value` + `onValueChange`）に変更します。

## Verification Plan

### Automated Tests
- 既存のテストが壊れていないか確認します（`pnpm test`）。
- 今回の変更はUIの振る舞いに関するものなので、手動検証を重視します。

### Manual Verification
1. **招待ページ**: `/shops/{id}/invite` にアクセスし、タブを切り替えます。URLの `?tab=...` が変化することを確認します。
2. **店舗詳細ページ**: `/shops/{id}` にアクセスし、タブを切り替えます。URLの `?tab=...` が変化することを確認します。
3. **ブラウザバック**: タブを変更した後、別のページに遷移し、ブラウザの「戻る」ボタンを押します。以前選択していたタブが表示されることを確認します。
