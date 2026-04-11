# マイグレーション基盤導入 実装計画

## Context

店舗設定変更機能（`doc/plans/2026-04-12_店舗設定変更_実装計画.md`）では `recruitments` テーブルに `shiftStartTime` / `shiftEndTime` を追加する際、既存レコードのバックフィルが必要になる。これを皮切りに、今後も Widen → Migrate → Narrow の3ステップ運用が継続的に発生するため、毎回使い捨ての `internalMutation` を書く運用は非効率。

本プランでは **`@convex-dev/migrations` の導入** と **CI/CD パイプラインへの自動実行組み込み** だけを行う。実マイグレーション定義（店舗名変更等）は含まない。

参考ファイル:
- `doc/plans/2026-04-12_店舗設定変更_実装計画.md` — 本基盤を利用する後続タスク
- `convex/CLAUDE.md` L164-181 — 既存の「スキーマ変更とマイグレーション」セクション
- `.github/workflows/deploy.yml` — develop / preview デプロイフロー
- `.github/workflows/release.yml` — main 本番リリースフロー
- `.github/CLAUDE.md` — CI/CD 運用ルール

## スコープ

### やる

- `@convex-dev/migrations` パッケージ追加
- `convex/convex.config.ts` 新規作成
- **`convex/migrations/` ディレクトリ構成** の採用（`index.ts` + 1ファイル1マイグレーション）
- 空の土台だけ作る（`m000_bootstrap.ts` のようなサンプル/プレースホルダは作らない）
- CI に migration 実行ステップを追加（develop / release の2箇所 — preview は追加しない）
- `convex/CLAUDE.md` / `.github/CLAUDE.md` 更新
- 型チェック・Convex dev デプロイで成立すること

### やらない

- 個別マイグレーション（`recruitments_addShiftTimes` 等）の実装
- `convex/schema.ts` の変更
- migrations.ts のユニットテスト（後続で必要時）
- 失敗時の手動 rollback 仕組み（現状は `convex run --component migrations lib:cancel` で十分）

---

## 設計判断

### 1. なぜ 1ファイル1マイグレーション方式か

- マイグレーションが積み上がる前提で、単一ファイルは PR レビュー・コンフリクト面で不利
- ファイル名にインデックスが入ることで順序が明示される（DB マイグレーションの業界慣習）
- `index.ts` が全マイグレーションのカタログ兼ランナーになり、登録忘れをコードレビューで検知しやすい

### 2. ファイル命名規則

- **`m{3桁連番}_{snake_case 機能名}.ts`** 例: `m001_recruitments_add_shift_times.ts`
- **先頭 `m` の理由**: Convex のファイル名は JS 識別子ルールで、**先頭が数字だと不可**。接頭辞 `m` を付けて回避する
- 連番は `001` から。欠番・再採番はしない（過去のランはログに残るため）
- 機能名は対象テーブルを先頭に置く（例: `recruitments_...`, `shops_...`）

### 3. ディレクトリ構造

```
convex/
  convex.config.ts          # 新規: コンポーネント登録
  migrations/               # 新規ディレクトリ
    index.ts                # Migrations インスタンス + runner（全マイグレーション列挙）
    m001_xxx.ts             # 後続PRで追加していく（本PRでは作らない）
```

Convex の API パスは `api.migrations.index.*` になる。CLI 実行は `npx convex run migrations/index:run`。

### 4. CI で走らせる判断

- **develop**: `convex deploy` の直後に `migrations/index:run` を実行。`@convex-dev/migrations` は冪等（完了済みマイグレーションは再ランしない）なので毎プッシュ実行して問題なし
- **main (release)**: 同様に `convex deploy` 直後に実行。本番の `CONVEX_DEPLOY_KEY` を使うので `--prod` フラグは不要（deploy key で対象環境が決まる）
- **PR preview**: **実行しない**。理由:
  - 現状の `deploy-preview` ジョブは毎プッシュで `convex import --replace-all` により preview DB を完全にリセット → seed 再投入している（`deploy.yml` L33-38）
  - つまり preview DB に「累積データ」が存在せず、常に `db.zip` の状態そのもの。Migrate すべき古いドキュメントが積み上がることがない
  - `db.zip` の形状が古くても、PR で Widen フェーズの fallback 読み取りを入れているはずなので preview アプリは問題なく動く
  - preview 向けの `convex run` CLI サポート（`--preview-name` 対応）も不確実で、わざわざ足を取られるリスクを避けたい
  - もし preview でもマイグレーションを試したくなった場合は後続タスクで追加する
- 失敗時は CI ジョブが落ちる → デプロイが失敗扱いになり気付ける

---

## 実装ステップ

### Step 1: パッケージ追加

```bash
pnpm add @convex-dev/migrations
```

### Step 2: `convex/convex.config.ts` 作成（新規）

```ts
import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(migrations);
export default app;
```

### Step 3: `convex/migrations/index.ts` 作成（新規）

```ts
import { Migrations } from "@convex-dev/migrations";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

// すべての定義済みマイグレーションをここに列挙する（順序 = 実行順）
// 新しいマイグレーションを追加するときは:
//   1. convex/migrations/m{連番}_{名前}.ts を作成
//   2. 下の配列に追記
export const run = migrations.runner([
  // 例: internal.migrations.m001_recruitments_add_shift_times.migration,
]);
```

> **⚠️ 実装時に確認すること**: `@convex-dev/migrations` の `runner()` が配列引数を取るか（`next` チェイン方式か）、`index.ts` で循環インポートにならないか。型定義で挙動を確認してから最終形を確定する。もし循環インポートが起きる場合は `index.ts` は `Migrations` インスタンスのエクスポートだけに留め、`runner` 用のランナーファイルを別に切る（例: `convex/migrations/runAll.ts`）。

### Step 4: 個別マイグレーションファイルのテンプレート（本PRでは作成しない）

後続 PR で以下のように追加する前提の型紙を `convex/CLAUDE.md` に記載する:

```ts
// convex/migrations/m001_recruitments_add_shift_times.ts
import { migrations } from "./index";

export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (ctx, doc) => {
    if (doc.shiftStartTime !== undefined) return; // 冪等チェック必須
    const shop = await ctx.db.get(doc.shopId);
    if (!shop) return;
    await ctx.db.patch(doc._id, {
      shiftStartTime: shop.shiftStartTime,
      shiftEndTime: shop.shiftEndTime,
    });
  },
});
```

そして `index.ts` の runner 配列に `internal.migrations.m001_recruitments_add_shift_times.migration` を追加する。

### Step 5: CI ワークフロー更新

#### 5-1. `.github/workflows/deploy.yml`

**`deploy-develop` ジョブ**（L90 以降）に migration 実行ステップを追加:

```yaml
      - name: Deploy Convex
        run: npx convex deploy
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      - name: Run Convex migrations
        run: npx convex run migrations/index:run
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      - name: Build
        # (既存のまま)
```

**`deploy-preview` ジョブ**（L15 以降）には **migration ステップを追加しない**。理由は「設計判断 4」参照。現状 `--replace-all` で毎プッシュ seed 再投入されるため、累積データに対する migration は発生しない。

#### 5-2. `.github/workflows/release.yml`

**`release` ジョブ**（L60 `Deploy Convex` の直後）に追加:

```yaml
      - name: Deploy Convex
        run: npx convex deploy
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      - name: Run Convex migrations (prod)
        run: npx convex run migrations/index:run
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      - name: Build
        # (既存のまま)
```

`CONVEX_DEPLOY_KEY` が Production environment の prod キーなので `--prod` 不要。

### Step 6: `convex/CLAUDE.md` 更新

L164-181 周辺を書き換え:

- L181 の「（未インストール）」を削除
- 以下を追記:

```markdown
### マイグレーション基盤（`@convex-dev/migrations`）

**構成**: 1ファイル1マイグレーション方式

- `convex/migrations/index.ts` — `Migrations` インスタンス + 全マイグレーションを列挙する runner
- `convex/migrations/m{連番}_{機能名}.ts` — 個別マイグレーション
- 命名規則: `m{3桁連番}_{snake_case}.ts`（先頭 `m` は Convex の識別子制約回避）
- 連番は欠番禁止・再採番禁止

**新しいマイグレーションの追加手順**:
1. `convex/migrations/m{次の連番}_{名前}.ts` を作成、`migrations.define({...})` を named export で書く
2. `convex/migrations/index.ts` の `runner([...])` 配列に追加
3. `pnpm convex:dev` で `_generated` が更新されることを確認
4. PR にマージ → CI が自動で develop 環境にマイグレーション実行
5. `release:*` ラベル付き PR で main マージ → 本番にも自動適用

**手動実行**（ローカル dev 等）:
- `npx convex run migrations/index:run`
- 進捗: `npx convex run --component migrations lib:getStatus --watch`
- キャンセル: `npx convex run --component migrations lib:cancel '{name: "migrations/mXXX_xxx:migration"}'`

**デプロイ手順（Widen → Migrate → Narrow）**:
1. スキーマに `v.optional()` で新フィールド追加（PR #1）
2. コード側はフォールバック付きで読み取り（PR #1 同梱）
3. マイグレーションファイル追加（PR #1 同梱 or PR #2）
4. PR マージ → CI が `convex deploy` → `migrations/index:run` を自動実行
5. 全件完了を確認（後日、`convex run --component migrations lib:getStatus` で検証）
6. `v.optional()` を外して Narrow（別 PR で）
```

### Step 7: `.github/CLAUDE.md` 更新

「デプロイ順序」セクション（L119 付近）を以下に更新:

```markdown
## デプロイ順序

Convex deploy → Convex migrations → ビルド → CloudFlare の順で実行する。
- Convex を先にデプロイすることで、スキーマ変更がビルド時に反映される
- `convex deploy` 直後に `migrations/index:run` を実行し、データのバックフィルを完了させてからビルドに進む
- マイグレーションは冪等なので、変更がないPRでも毎回走る（完了済みはスキップされる）
- ビルド時に `VITE_CONVEX_URL` を環境変数として埋め込む
```

---

## 変更ファイル一覧

| パス | 操作 |
|---|---|
| `package.json` / `pnpm-lock.yaml` | `@convex-dev/migrations` 追加 |
| `convex/convex.config.ts` | 新規作成 |
| `convex/migrations/index.ts` | 新規作成 |
| `.github/workflows/deploy.yml` | `deploy-develop` に migration ステップ追加（`deploy-preview` は変更なし） |
| `.github/workflows/release.yml` | `release` に migration ステップ追加 |
| `convex/CLAUDE.md` | L164-181 周辺を更新 |
| `.github/CLAUDE.md` | 「デプロイ順序」更新 |
| `convex/_generated/*` | `convex dev` により自動再生成 |

---

## 検証方法

### ローカル

1. `pnpm add @convex-dev/migrations` 後に `pnpm convex:dev` を起動。エラーなく `_generated/api.d.ts` に `components.migrations` / `api.migrations.index` が生成されること
2. SubAgent で `pnpm type-check` が通ること
3. SubAgent で `pnpm lint` が通ること
4. `npx convex run migrations/index:run` を手動実行し、「マイグレーションなし」の応答で完了すること（runner 配列が空なので正常）
5. `npx convex run --component migrations lib:getStatus` で状態が見えること

### CI

6. 本 PR（基盤導入）を develop 向けに開き、`deploy-preview` が従来通り成功すること（migration ステップは無い）
7. develop にマージし、`deploy-develop` ジョブの新規 migration ステップが 0 件成功で終わること
8. 本番へのリリースは後続 PR とまとめて行う（本 PR 単独で `release:*` は付けない）

---

## リスクと注意点

- **`convex.config.ts` 初導入の影響**: 現状このリポジトリには `convex.config.ts` が無く、コンポーネント機能自体を初めて使う。追加による副作用が無いか、必ず `pnpm convex:dev` でローカル検証してからコミットする
- **CI の deploy key 権限**: `CONVEX_DEPLOY_KEY` が `convex run` も実行できる権限を持っているか確認。deploy 専用キーと run 専用キーで分かれている場合は secrets 側の追加が必要
- **循環インポート**: `migrations/index.ts` が runner 配列で各 `mXXX.ts` を参照し、各 `mXXX.ts` が `index.ts` から `migrations` インスタンスを import する。TS のモジュールローダ上は問題ないはずだが、実装時に要確認
- **本 PR の範囲は「土台だけ」**: 個別マイグレーションを含めないので、CI の migration ステップは 0 件処理になる。これが「何もしないで成功」なのか「何もなくて失敗」なのか CLI の挙動を確認する（失敗するなら runner 配列に空の `runner()` ではなく conditional skip が必要）

---

## 後続タスク（本プラン完了後）

`doc/plans/2026-04-12_店舗設定変更_実装計画.md` の Step 2 以降:
1. `recruitments` テーブルに `shiftStartTime` / `shiftEndTime` を `v.optional` で追加（Widen）
2. `convex/migrations/m001_recruitments_add_shift_times.ts` 新規作成
3. `convex/migrations/index.ts` の runner 配列に追記
4. PR をマージ → CI が develop 環境にマイグレーション自動実行
5. develop で全件完了を確認
6. 別 PR でスキーマ Narrow（`v.optional` を外す）
7. `release:*` 付きで main マージ → 本番に順次適用
