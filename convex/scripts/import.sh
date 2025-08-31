#!/bin/bash

# import.sh - Convexデータベースに複数のJSONLファイルをインポートするスクリプト

echo "=========================================="
echo "Convexデータベースにシードデータをインポートします..."
echo "=========================================="

# プロジェクトルートに移動（package.jsonがあるディレクトリ）
# スクリプトがconvex/seeds/import.shにある場合、2階層上がルート
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$SCRIPT_DIR/../.."
cd "$PROJECT_ROOT" || exit 1

echo "作業ディレクトリ: $(pwd)"

# package.jsonの存在確認
if [ ! -f "package.json" ]; then
    echo "❌ package.jsonが見つかりません。Convexプロジェクトのルートディレクトリで実行してください。"
    exit 1
fi

echo "✅ package.jsonを確認しました"

# Node.js/npxの確認
echo ""
echo "Node.js環境の確認..."
echo "----------------------------------------"

if command -v node > /dev/null 2>&1; then
    NODE_VERSION=$(node --version 2>&1)
    echo "✅ Node.js バージョン: $NODE_VERSION"
else
    echo "❌ Node.jsが見つかりません"
    exit 1
fi

if command -v npx > /dev/null 2>&1; then
    NPX_VERSION=$(npx --version 2>&1)
    echo "✅ npx バージョン: $NPX_VERSION"
else
    echo "❌ npxが見つかりません"
    exit 1
fi

# seedsディレクトリの確認
SEEDS_DIR="./convex/seeds"
echo ""
echo "seedsディレクトリの確認..."
echo "----------------------------------------"

if [ ! -d "$SEEDS_DIR" ]; then
    echo "❌ seedsディレクトリが見つかりません: $SEEDS_DIR"
    echo "現在のディレクトリの内容:"
    ls -la
    exit 1
fi

echo "✅ seedsディレクトリが見つかりました"
echo "seedsディレクトリの内容:"
ls -la "$SEEDS_DIR"

# .jsonlファイルの確認
echo ""
echo "処理対象ファイルの確認..."
echo "----------------------------------------"

FOUND_FILES=false
for file in "$SEEDS_DIR"/*.jsonl; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        if [ "$filename" != "empty.jsonl" ]; then
            table_name="${filename%.jsonl}"
            echo "  - $filename -> $table_name テーブル"
            FOUND_FILES=true
        fi
    fi
done

if [ "$FOUND_FILES" != "true" ]; then
    echo "❌ インポートするJSONLファイルが見つかりません"
    exit 1
fi

echo ""
echo "インポートを開始します..."
echo "=========================================="

# ファイルを処理
for file in "$SEEDS_DIR"/*.jsonl; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        
        # empty.jsonlをスキップ
        if [ "$filename" = "empty.jsonl" ]; then
            continue
        fi
        
        # ファイル名から拡張子を除去してテーブル名を取得
        table_name="${filename%.jsonl}"
        
        echo ""
        echo "=================================================="
        echo "インポート中: $filename -> テーブル: $table_name"
        echo "ファイルパス: $file"
        echo "=================================================="
        
        # ファイルサイズとプレビューを表示
        if [ -f "$file" ]; then
            file_size=$(wc -c < "$file")
            echo "ファイルサイズ: $file_size バイト"
            echo "ファイルの最初の3行:"
            head -n 3 "$file" 2>/dev/null || echo "ファイルの読み取りに失敗"
            echo "----------------------------------------"
        fi
        
        # 一時ファイルを準備
        STDOUT_FILE=$(mktemp)
        STDERR_FILE=$(mktemp)
        
        # Convexインポートコマンドを実行
        echo "実行コマンド: npx convex import --table '$table_name' --replace-all '$file' --yes"
        echo ""
        
        # コマンドを実行し、出力とエラーを分離
        npx convex import --table "$table_name" --replace-all "$file" --yes > "$STDOUT_FILE" 2> "$STDERR_FILE"
        EXIT_CODE=$?
        
        # 標準出力を表示
        if [ -s "$STDOUT_FILE" ]; then
            echo "📋 標準出力:"
            echo "----------------------------------------"
            cat "$STDOUT_FILE"
            echo "----------------------------------------"
        fi
        
        # 標準エラーを表示
        if [ -s "$STDERR_FILE" ]; then
            echo "🔴 標準エラー:"
            echo "----------------------------------------"
            cat "$STDERR_FILE"
            echo "----------------------------------------"
        fi
        
        # 結果を表示
        echo ""
        if [ $EXIT_CODE -eq 0 ]; then
            echo "✅ $table_name テーブルのインポートが完了しました (終了コード: $EXIT_CODE)"
        else
            echo "❌ $table_name テーブルのインポートでエラーが発生しました (終了コード: $EXIT_CODE)"
            
            # 追加のデバッグ情報
            echo ""
            echo "🔍 デバッグ情報:"
            echo "  - PWD: $(pwd)"
            echo "  - ファイル存在確認: $(ls -la "$file" 2>/dev/null || echo "ファイルが見つかりません")"
            echo "  - npx PATH: $(which npx 2>/dev/null || echo "npxが見つかりません")"
        fi
        
        # 一時ファイルをクリーンアップ
        rm -f "$STDOUT_FILE" "$STDERR_FILE"
        
        echo ""
    fi
done

echo "=========================================="
echo "全ての処理が完了しました！"
echo "=========================================="