# ナビゲーションUX改善 仕様書

## 概要

| 項目 | 内容 |
|------|------|
| 作成日 | 2025-12-09 |
| 目的 | 店舗→スタッフ一覧への遷移を2クリック→1クリックに改善 |
| 対象 | SideMenu（PC）、BottomMenu（モバイル） |

---

## 1. 現状の課題

### 遷移フロー（Before）
```
店舗一覧(/shops) → 店舗詳細(/shops/:shopId) → スタッフタブ
      ↑クリック1                    ↑クリック2
```

### 問題点
- スタッフ一覧到達まで2クリック必要
- 店舗コンテキスト（現在どの店舗を見ているか）が不明確
- 頻繁に使う機能へのアクセスが遠い

---

## 2. 設計（After）

### 2.1 モバイル: BottomNavBar + BottomSheet

#### BottomNavBar（常時表示・4項目）
```
┌──────────────────────────────────────────────────┐
│  🏠 マイページ │ 📅 シフト │ 👥 スタッフ │ ☰ メニュー │
└──────────────────────────────────────────────────┘
```

| アイコン | ラベル | 遷移先 | 備考 |
|---------|--------|--------|------|
| LuLayoutDashboard | マイページ | `/mypage` | 変更なし |
| LuCalendar | シフト | `/shifts` | 変更なし |
| LuUsers | スタッフ | `/shops/{selectedShopId}/staffs` | **新規** |
| LuMenu | メニュー | BottomSheet起動 | **新規** |

#### BottomSheet（☰タップで表示）
```
┌─────────────────────────────────────┐
│  📦 現在の店舗: 本店          ▼     │  ← 店舗選択ドロップダウン
│  ─────────────────────────────────  │
│  🏪 店舗一覧                        │
│  ⚙️ 設定                           │
│  🚪 ログアウト                      │
└─────────────────────────────────────┘
```

### 2.2 PC: SideMenu改修

```
┌────────────────────────┐
│  シフト管理             │  ← タイトル（変更なし）
├────────────────────────┤
│  📦 本店           ▼   │  ← 店舗選択ドロップダウン【新規】
├────────────────────────┤
│  👥 スタッフ一覧        │  ← 選択店舗【新規】
│  📅 シフト管理          │  ← 選択店舗
├────────────────────────┤
│  🏠 マイページ          │
│  🏪 店舗一覧            │
│  ⚙️ 設定              │
├────────────────────────┤
│  🚪 ログアウト          │
└────────────────────────┘
```

#### メニュー項目の分類

| グループ | 項目 | 遷移先 |
|----------|------|--------|
| **店舗コンテキスト** | スタッフ一覧 | `/shops/{selectedShopId}/staffs` |
| **店舗コンテキスト** | シフト管理 | `/shifts` |
| **グローバル** | マイページ | `/mypage` |
| **グローバル** | 店舗一覧 | `/shops` |
| **グローバル** | 設定 | `/settings` |
| **アクション** | ログアウト | Clerk SignOut |

---

## 3. 状態管理

### 3.1 選択中店舗 Atom

**ファイル**: `src/stores/shop/index.ts`

```typescript
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

type SelectedShopType = {
  shopId: string | null;
  shopName: string;
};

// localStorage永続化
export const selectedShopAtom = atomWithStorage<SelectedShopType>(
  "selected-shop",
  { shopId: null, shopName: "" }
);

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom(
  (get) => get(selectedShopAtom).shopId !== null
);
```

### 3.2 店舗選択ロジック

#### 初回ログイン時
| 店舗数 | 動作 |
|--------|------|
| 0 | 店舗作成ページ（`/shops/new`）へ誘導 |
| 1 | 自動選択 |
| 2以上 | **最初の店舗を自動選択** |

#### 2回目以降のログイン
1. localStorageから`selectedShopId`を取得
2. 店舗一覧APIを取得
3. `selectedShopId`が存在する → そのまま使用
4. `selectedShopId`が存在しない（削除/アーカイブ） → 初回ロジックに戻る

```
ログイン
  ↓
localStorage から selectedShopId 取得
  ↓
店舗一覧API取得
  ↓
selectedShopId が存在する？
  ├─ YES → そのまま使用
  └─ NO → 初回ロジック（最初の店舗を自動選択）
```

---

## 4. ルーティング

### 4.1 新規ルート

| パス | ページ | 説明 |
|------|--------|------|
| `/shops/$shopId/staffs` | StaffListPage | スタッフ一覧（独立ページ） |

### 4.2 既存ルート（変更なし）

| パス | 説明 |
|------|------|
| `/shifts` | シフト管理（機能未実装のため変更なし） |
| `/shops/$shopId` | 店舗詳細（スタッフタブは残す） |
| `/shops/$shopId/staffs/$staffId` | スタッフ詳細 |

---

## 5. コンポーネント設計

### 5.1 ShopSelector（店舗選択ドロップダウン）

**ファイル**: `src/components/features/Shop/ShopSelector/index.tsx`

```typescript
type ShopSelectorProps = {
  shops: Array<{ _id: string; shopName: string }>;
  selectedShopId: string | null;
  onSelect: (shopId: string) => void;
  isLoading?: boolean;
};
```

#### 仕様
- ドロップダウン形式（既存のSelectコンポーネント流用）
- 選択時に`selectedShopAtom`更新
- ローディング状態対応

### 5.2 BottomSheet

**ファイル**: `src/components/templates/BottomSheet/index.tsx`

```typescript
type BottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};
```

#### 仕様
- Chakra UI `Drawer`（`placement="bottom"`）使用
- 外側タップで閉じる
- スワイプダウンで閉じる（オプション）

### 5.3 BottomNavBar（BottomMenu改修）

**ファイル**: `src/components/templates/BottomMenu/index.tsx`

#### 変更点
| Before | After |
|--------|-------|
| マイページ | マイページ |
| シフト管理 | シフト |
| 店舗一覧 | **スタッフ** |
| 設定 | **メニュー** |

#### 仕様
- 「スタッフ」は選択店舗IDを使って動的URL生成
- 「メニュー」はBottomSheet開閉トリガー
- 店舗未選択時はBottomSheetを強制表示

### 5.4 SideMenu改修

**ファイル**: `src/components/templates/SideMenu/index.tsx`

#### 変更点
- 上部にShopSelector追加
- メニュー項目を3グループに分離（店舗コンテキスト/グローバル/アクション）
- 区切り線（Divider）追加

---

## 6. ワイヤーフレーム

### 6.1 モバイル

```
【通常状態】
┌─────────────────────────────────────────────┐
│                                             │
│              メインコンテンツ                 │
│                                             │
├─────────────────────────────────────────────┤
│   🏠        📅        👥        ☰          │
│ マイページ   シフト   スタッフ    メニュー     │
└─────────────────────────────────────────────┘

【BottomSheet展開時】
┌─────────────────────────────────────────────┐
│              メインコンテンツ                 │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │   📦 本店                       ▼     │  │
│  │   ─────────────────────────────────   │  │
│  │   🏪 店舗一覧                         │  │
│  │   ⚙️ 設定                            │  │
│  │   🚪 ログアウト                       │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│   🏠        📅        👥        ☰          │
└─────────────────────────────────────────────┘
```

### 6.2 PC

```
┌────────────────────┬────────────────────────────────────────┐
│                    │                                        │
│   シフト管理        │                                        │
│                    │                                        │
│  ┌──────────────┐  │                                        │
│  │ 📦 本店   ▼  │  │                                        │
│  └──────────────┘  │                                        │
│                    │                                        │
│  👥 スタッフ一覧    │              メインコンテンツ            │
│  📅 シフト管理      │                                        │
│                    │                                        │
│  ────────────────  │                                        │
│                    │                                        │
│  🏠 マイページ      │                                        │
│  🏪 店舗一覧        │                                        │
│  ⚙️ 設定          │                                        │
│                    │                                        │
│  ────────────────  │                                        │
│  🚪 ログアウト      │                                        │
│                    │                                        │
└────────────────────┴────────────────────────────────────────┘
```

---

## 7. 修正ファイル一覧

| 操作 | ファイルパス | 説明 |
|------|-------------|------|
| **新規** | `src/stores/shop/index.ts` | 選択店舗の状態管理 |
| **新規** | `src/components/features/Shop/ShopSelector/index.tsx` | 店舗選択ドロップダウン |
| **新規** | `src/components/features/Shop/ShopSelector/index.stories.tsx` | Storybook |
| **新規** | `src/components/templates/BottomSheet/index.tsx` | BottomSheetコンポーネント |
| **新規** | `src/components/templates/BottomSheet/index.stories.tsx` | Storybook |
| **新規** | `src/routes/_auth/shops/$shopId/staffs/index.tsx` | スタッフ一覧ルート |
| **新規** | `src/components/pages/Shops/StaffListPage/index.tsx` | スタッフ一覧ページ |
| **修正** | `src/components/templates/BottomMenu/index.tsx` | BottomNavBar化 |
| **修正** | `src/components/templates/SideMenu/index.tsx` | 店舗選択追加 |
| **修正** | `src/routes/_auth.tsx` | 初期店舗選択ロジック |

---

## 8. E2Eテスト影響範囲

### 8.1 影響度別分類

#### 高リスク（要確認）
| ファイル | テスト数 | 影響理由 |
|----------|----------|----------|
| `e2e/scenarios/staff/list.test.ts` | 4 | スタッフ一覧への遷移方法変更 |
| `e2e/scenarios/shop/detail.test.ts` | 4 | タブ切り替えUI |
| `e2e/scenarios/staff/add.test.ts` | 3 | スタッフ追加への遷移 |
| `e2e/scenarios/staff/edit.test.ts` | 3 | スタッフ編集への遷移 |

#### 中リスク（確認推奨）
| ファイル | テスト数 | 影響理由 |
|----------|----------|----------|
| `e2e/scenarios/shop/list.test.ts` | 4 | 店舗一覧UI |
| `e2e/scenarios/invite/create.test.ts` | 3 | スタッフタブ経由 |

#### 低リスク（影響なし）
| ファイル | テスト数 |
|----------|----------|
| `e2e/scenarios/settings/user-profile.test.ts` | - |
| `e2e/scenarios/auth/auth.test.ts` | - |

### 8.2 影響を受けるセレクタ

```typescript
// 店舗詳細のスタッフタブ（変更可能性あり）
page.getByRole("tab", { name: "スタッフ" })

// スタッフカードへのリンク（URL変更で影響）
page.locator('a[href*="/staffs/"]')
```

### 8.3 ナビゲーションヘルパー

**ファイル**: `e2e/helpers/navigation.ts`

以下の関数が影響を受ける可能性：
- `goToStaffTab()` - タブUIが変わる場合
- `goToStaffList()` - 遷移方法が変わる場合

---

## 9. 実装フェーズ

### Phase 1: 基盤整備（状態管理 + 初期店舗選択ロジック）

**目的:** selectedShopAtom作成と初期選択ロジックの実装

| 操作 | ファイル | 概要 |
|------|----------|------|
| 新規 | `src/stores/shop/index.ts` | selectedShopAtom定義（atomWithStorageでlocalStorage永続化） |
| 新規 | `src/hooks/useInitializeShop.ts` | 初期店舗選択ロジック |
| 修正 | `src/routes/_auth.tsx` | レイアウトレベルで店舗一覧取得・useInitializeShop呼び出し |

**タスク:**
- [ ] `selectedShopAtom` 定義（型: `{ shopId: string; shopName: string } | null`）
- [ ] 初期店舗選択ロジック実装
  - 店舗0件: null
  - 店舗1件: 自動選択
  - 店舗2件以上: localStorage確認 → なければ最初の店舗
- [ ] `_auth.tsx` でレイアウトレベルでの店舗データ取得

**依存:** なし

---

### Phase 2: ShopSelector コンポーネント作成

**目的:** 店舗切り替え用ドロップダウンの実装

| 操作 | ファイル | 概要 |
|------|----------|------|
| 新規 | `src/components/features/Shop/ShopSelector/index.tsx` | 店舗セレクター |
| 新規 | `src/components/features/Shop/ShopSelector/index.stories.tsx` | Storybook |

**タスク:**
- [ ] Props定義: `shops`, `selectedShopId`, `onShopChange`
- [ ] 既存Selectコンポーネント活用
- [ ] 店舗選択時に `selectedShopAtom` 更新
- [ ] Storybook作成（Basic パターン）

**依存:** Phase 1（selectedShopAtom）

---

### Phase 3: PC SideMenu 改修

**目的:** SideMenuに店舗セレクターを追加し、メニューをグループ化

| 操作 | ファイル | 概要 |
|------|----------|------|
| 修正 | `src/components/templates/SideMenu/index.tsx` | ShopSelector追加・グループ化 |

**タスク:**
- [ ] 上部にShopSelector追加
- [ ] メニュー3グループ化:
  - 店舗コンテキスト: スタッフ一覧、シフト管理
  - グローバル: マイページ、店舗一覧、設定
  - アクション: ログアウト
- [ ] 店舗未選択時は店舗コンテキストメニュー非活性化
- [ ] Props追加: `shops`, `selectedShopId`, `onShopChange`

**依存:** Phase 2（ShopSelector）

---

### Phase 4: スタッフ一覧ルート新規作成

**目的:** `/shops/$shopId/staffs` ルートを作成

| 操作 | ファイル | 概要 |
|------|----------|------|
| 新規 | `src/routes/_auth/shops/$shopId/staffs/index.tsx` | スタッフ一覧ルート |
| 新規 | `src/components/pages/Shops/StaffsPage/index.tsx` | スタッフページ |
| 新規 | `src/components/features/Shop/StaffListStandalone/index.tsx` | スタンドアロンスタッフ一覧 |
| 新規 | `src/components/features/Shop/StaffListStandalone/index.stories.tsx` | Storybook |

**タスク:**
- [ ] TanStack Routerルート定義
- [ ] useQueryでスタッフ一覧取得
- [ ] ローディング/エラー/正常ケースハンドリング
- [ ] 既存StaffTabのロジック再利用
- [ ] ページ用タイトル追加

**依存:** Phase 1（selectedShopAtomでshopId取得可能）

---

### Phase 5: BottomSheet コンポーネント作成

**目的:** モバイル用メニューシートの実装

| 操作 | ファイル | 概要 |
|------|----------|------|
| 新規 | `src/components/ui/BottomSheet/index.tsx` | BottomSheet |
| 新規 | `src/components/ui/BottomSheet/index.stories.tsx` | Storybook |

**タスク:**
- [ ] Chakra UI v3 Drawer使用（placement="bottom"）
- [ ] `useBottomSheet` フック作成（useDialogパターン参考）
- [ ] Storybook作成

**依存:** なし（並行開発可能）

---

### Phase 6: モバイル BottomMenu 改修

**目的:** BottomMenuを4項目に変更し、メニューからBottomSheetを開く

| 操作 | ファイル | 概要 |
|------|----------|------|
| 修正 | `src/components/templates/BottomMenu/index.tsx` | 4項目化・メニューボタン追加 |
| 新規 | `src/components/templates/BottomMenu/MenuBottomSheet.tsx` | メニューシート |

**タスク:**
- [ ] 4項目に変更:
  - マイページ (`/mypage`)
  - シフト (`/shifts`)
  - スタッフ (`/shops/$selectedShopId/staffs`)
  - メニュー (BottomSheet開く)
- [ ] メニュータップでBottomSheet表示
- [ ] MenuBottomSheet作成（ShopSelector、店舗一覧、設定、ログアウト）
- [ ] Props追加: `shops`, `selectedShopId`, `onShopChange`

**依存:** Phase 2, Phase 5

---

### Phase 7: E2Eテスト修正

**目的:** ナビゲーションヘルパーの更新

| 操作 | ファイル | 概要 |
|------|----------|------|
| 修正 | `e2e/helpers/navigation.ts` | ナビゲーションヘルパー更新 |
| 確認 | `e2e/scenarios/staff/list.test.ts` | スタッフ一覧テスト |
| 確認 | `e2e/scenarios/staff/add.test.ts` | スタッフ追加テスト |
| 確認 | `e2e/scenarios/staff/edit.test.ts` | スタッフ編集テスト |
| 確認 | `e2e/scenarios/staff/resign.test.ts` | スタッフ退職テスト |

**タスク:**
- [ ] `goToStaffList` を1クリックパターンに更新
- [ ] PC: SideMenuからスタッフ選択
- [ ] SP: BottomMenuからスタッフタップ
- [ ] 既存テストとの後方互換性維持
- [ ] 関連E2Eテストの確認・修正

**依存:** Phase 3, Phase 4, Phase 6（全UI完成後）

---

### 依存関係図

```
Phase 1 (状態管理)
    ├── Phase 2 (ShopSelector)
    │       └── Phase 3 (SideMenu改修)
    │               └── Phase 7 (E2E)
    └── Phase 4 (スタッフルート)
            └── Phase 7 (E2E)

Phase 5 (BottomSheet) ──────┐
                            ├── Phase 6 (BottomMenu改修)
Phase 2 (ShopSelector) ─────┘           └── Phase 7 (E2E)
```

---

### 全ファイル一覧

#### 新規作成（11ファイル）

| ファイルパス | Phase |
|-------------|-------|
| `src/stores/shop/index.ts` | 1 |
| `src/hooks/useInitializeShop.ts` | 1 |
| `src/components/features/Shop/ShopSelector/index.tsx` | 2 |
| `src/components/features/Shop/ShopSelector/index.stories.tsx` | 2 |
| `src/routes/_auth/shops/$shopId/staffs/index.tsx` | 4 |
| `src/components/pages/Shops/StaffsPage/index.tsx` | 4 |
| `src/components/features/Shop/StaffListStandalone/index.tsx` | 4 |
| `src/components/features/Shop/StaffListStandalone/index.stories.tsx` | 4 |
| `src/components/ui/BottomSheet/index.tsx` | 5 |
| `src/components/ui/BottomSheet/index.stories.tsx` | 5 |
| `src/components/templates/BottomMenu/MenuBottomSheet.tsx` | 6 |

#### 修正（4ファイル）

| ファイルパス | Phase |
|-------------|-------|
| `src/routes/_auth.tsx` | 1 |
| `src/components/templates/SideMenu/index.tsx` | 3 |
| `src/components/templates/BottomMenu/index.tsx` | 6 |
| `e2e/helpers/navigation.ts` | 7 |

---

## 10. データフロー

### 10.1 店舗一覧の取得タイミング

```
_auth.tsx (レイアウト)
  ↓
useQuery(api.shops.listByUser) で店舗一覧取得
  ↓
selectedShopAtom の初期化/バリデーション
  ↓
SideMenu / BottomMenu に shops を props で渡す
```

### 10.2 店舗選択の更新フロー

```
ShopSelector で店舗選択
  ↓
setSelectedShop({ shopId, shopName }) で atom 更新
  ↓
localStorage に自動保存（atomWithStorage）
  ↓
SideMenu/BottomNavBar の遷移先URL が自動更新
```

### 10.3 PC/モバイル間の状態共有

- `selectedShopAtom` は共通（Jotai）
- localStorage も共通
- どちらで選択しても反映される

---

## 11. エラーハンドリング

### 11.1 店舗一覧取得失敗時

| 状況 | 動作 |
|------|------|
| API エラー | エラートースト表示、リトライボタン |
| ローディング中 | Skeleton 表示 |

### 11.2 店舗未選択時の動作

| コンポーネント | 動作 |
|---------------|------|
| **BottomNavBar「スタッフ」** | タップ時に BottomSheet を開く（店舗選択を促す） |
| **SideMenu「スタッフ一覧」** | 非活性表示 or クリック時にトースト「店舗を選択してください」 |

### 11.3 店舗0件時

```
┌─────────────────────────────────────┐
│                                     │
│   🏪 まだ店舗がありません            │
│                                     │
│   [店舗を作成する]                   │
│                                     │
└─────────────────────────────────────┘
```

- BottomSheet 内に空状態UI表示
- 「店舗を作成する」ボタンで `/shops/new` へ遷移

---

## 12. UI詳細仕様

### 12.1 BottomSheet

| 項目 | 値 |
|------|-----|
| 高さ | `auto`（コンテンツに応じて） |
| 最大高さ | `60vh` |
| 角丸 | `borderTopRadius="xl"` (16px) |
| 背景 | `white` |
| オーバーレイ | `blackAlpha.600` |
| アニメーション | Chakra UI Drawer デフォルト |

### 12.2 ShopSelector

| 項目 | 値 |
|------|-----|
| 幅 | `100%`（親要素に従う） |
| 高さ | `40px` |
| 背景 | `gray.50` |
| ボーダー | `1px solid` `gray.200` |
| 角丸 | `md` (6px) |
| フォント | `sm` |

### 12.3 区切り線

```typescript
<Divider borderColor="gray.200" />
```

### 12.4 アニメーション

| 要素 | トランジション |
|------|--------------|
| メニュー項目ホバー | `all 0.15s` |
| BottomSheet | Chakra UI デフォルト（slide-up） |
| ShopSelector | なし |

---

## 13. 既存コード参照

### 13.1 流用するコンポーネント

| 用途 | 参照ファイル |
|------|-------------|
| スタッフ一覧UI | `src/components/features/Shop/ShopDetail/TabContents/StaffTab/index.tsx` |
| Selectコンポーネント | `src/components/ui/Select/index.tsx` |
| Drawerの使用例 | Chakra UI v3 公式ドキュメント |

### 13.2 参考にするパターン

```typescript
// StaffTab から流用するもの
- スタッフカードのレイアウト
- 検索・フィルター機能
- ローディング/空状態表示
```

---

## 14. Storybookパターン

### 14.1 ShopSelector

| ストーリー名 | 説明 |
|-------------|------|
| Default | 店舗選択済み |
| NoSelection | 未選択状態 |
| Loading | ローディング中 |
| SingleShop | 店舗1件のみ |
| ManyShops | 店舗10件 |

### 14.2 BottomSheet

| ストーリー名 | 説明 |
|-------------|------|
| Open | 開いた状態 |
| WithShopSelector | 店舗選択付き |
| EmptyState | 店舗0件 |

### 14.3 SideMenu

| ストーリー名 | 説明 |
|-------------|------|
| Default | 通常状態 |
| NoShopSelected | 店舗未選択 |
| Loading | ローディング中 |

### 14.4 BottomNavBar

| ストーリー名 | 説明 |
|-------------|------|
| Default | 通常状態 |
| SheetOpen | BottomSheet展開中 |
| NoShopSelected | 店舗未選択 |

---

## 15. 完了条件（受け入れ基準）

### 機能要件

- [ ] PCでサイドメニューから店舗を選択できる
- [ ] PCで「スタッフ一覧」クリックで選択店舗のスタッフ一覧に遷移
- [ ] モバイルでBottomNavBarの「スタッフ」タップで選択店舗のスタッフ一覧に遷移
- [ ] モバイルで「メニュー」タップでBottomSheetが開く
- [ ] BottomSheetで店舗を選択できる
- [ ] ページリロード後も選択店舗が維持される
- [ ] 店舗未選択時に適切な誘導がある
- [ ] 店舗0件時に作成ページへの誘導がある

### 非機能要件

- [ ] 全コンポーネントにStorybookがある
- [ ] TypeScript型エラーがない（`pnpm type-check` パス）
- [ ] Lintエラーがない（`pnpm lint` パス）
- [ ] E2Eテストがパスする（`pnpm e2e`）

---

## 16. 注意事項

1. **localStorage永続化**: `atomWithStorage`でリロード後も店舗選択を維持
2. **起動時バリデーション**: `selectedShopId`が有効かチェック
3. **既存機能への影響**: 店舗詳細ページのスタッフタブは残す
4. **アイコン追加**: `LuUsers`（スタッフ）、`LuMenu`（メニュー）をimport
5. **E2Eテスト**: 実装後に影響テストを必ず実行
6. **Chakra UI v3**: Drawer APIはv3形式（`Drawer.Root`, `Drawer.Content`等）を使用
