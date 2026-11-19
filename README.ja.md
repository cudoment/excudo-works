# excudo-works

[English](README.md) | [한국어](README.ko.md) | 日本語 | [简体中文](README.zh-CN.md)

Excudo ワークスペースに、毎日の自動化と、編集できる週次レポートを追加するパッケージです。
原則と判断の基準は、利用者が決めます。
Node 22.16 以上と Excudo `^0.8.0` が必要です。macOS、Linux、Windows で動作します。
この製品の言語は英語と韓国語だけです。このガイドは日本語で読めるように用意した案内で、生成されるファイルとメモは英語(`en`)で作られます。

## 5分で始める

先にエンジンでワークスペースを作り、その中にこのパッケージを追加します。今いるフォルダには何もインストールしません。

```sh
npx -y excudo@^0.8.0 init my-work --locale en
cd my-work
npm install
git init
npx --no-install excudo start --report --json
npm install --save-dev excudo-works@^0.2.0
npx --no-install excudo-works init . --locale en
npx --no-install excudo-works doctor
npx --no-install excudo-works run --manual --only report
```

`doctor` が `activity` の警告を表示したら、`excudo.config.mjs` で `conversations` を有効にします。
エンジンがコーディングエージェントへの依頼を読み、学習してスキルを作るようになります。
既存の設定、ポリシー、利用者のスキルフォルダは保持されます。
最初に生成された `weekly.md` を開いて、週次レポートを確認してください。

## コーディングエージェントでインストールする

次の文をコーディングエージェント(Claude Code、Codex など)に貼り付けます。

> Set up Excudo Works from https://github.com/cudoment/excudo-works in a new folder, following the section "コーディングエージェントでインストールする" of its README.ja.md

意味: 新しいフォルダに、https://github.com/cudoment/excudo-works から Excudo Works をセットアップしてください。README.ja.md のセクション "コーディングエージェントでインストールする" に従ってください。

エージェントは次の規則に従います。

- Node 22.16 以上(https://nodejs.org)を必須とし、それより古い場合はそのリンクを示して停止します。
- フォルダ名だけを一度尋ねます。言語は尋ねず、`en` を使います。フォルダ名を `my-work` の代わりに使い、`--locale` の値はどちらも `en` のままにします。ほかは何も変えません。
- 利用者との会話は、`--locale` の値に関係なく、利用者の言語(日本語、またはほかの言語)で続けます。
- グローバルインストールはしません。`npx -y` とプロジェクト内の `npm install` だけを使います。
- "5分で始める"の最初のコマンド `npx -y excudo@^0.8.0 init my-work --locale en` を実行します。`init` の後で、新しいフォルダの絶対パスを一度だけ求めます(例: 現在のフォルダに `my-work` を付けたパス)。それ以降のコマンドはすべてそのフォルダ内で、次の2行に分けて実行します。各行は `cd <絶対パス>` で始め、プレースホルダーの代わりに完全なパスを入れます。シェルがどのフォルダにあっても動作します。
- 1行目はエンジンをインストールし、状態を報告します。`init` は git を実行しないため、`git init` はここに含まれています。
  `cd <absolute folder path> && npm install && git init && npx --no-install excudo start --report --json`
- 報告を読みます。`workspace`、`install`、`git`、`skills` の各ステップがすべて `done` である必要があります。`start --report` はどちらの場合も終了コード 0 を返すので、ステップを自分で確認します。`done` でないものがあれば、停止してその `id` と `state` を示し、利用者に尋ねます。2行目は実行しません。
- 4つのステップがすべて `done` のときだけ、パッケージをインストールする2行目を実行します。
  `cd <absolute folder path> && npm install --save-dev excudo-works@^0.2.0 && npx --no-install excudo-works init . --locale en && npx --no-install excudo-works doctor && npx --no-install excudo-works run --manual --only report`
- 報告の4つのステップが `done` で、`doctor` が成功すれば、セットアップは確認済みです。
- コマンドが失敗したら、修正を推測せずに停止し、エラー出力の末尾を示します。
- 次の手順を利用者に伝えます。生成された `weekly.md` を開き、`activity` などの `doctor` の警告に対処します。

## 更新する

次のコマンドで、レジストリの新しいバージョン、インストール済みバージョンのリリースノート、更新用のコマンドを確認します。

```sh
npx --no-install excudo-works update
```

`update` はオフラインでもローカルの記録とリンクを更新します。
`--apply` を付けると、表示されたインストールを実行し、新しいバージョンで記録を移行します。
利用者の操作が必要な変更は、変更履歴の "Owner action" の下に最初に表示されます。

## 問題を報告する

次のコマンドで、ローカルの Issue 下書きと Issue 作成用のリンクを表示します。

```sh
npx --no-install excudo-works feedback
```

下書きは自動では送信されません。内容を確認してから、https://github.com/cudoment/excudo-works/issues に自分で投稿してください。

## 詳しい資料

すべての設定、コマンド、仕様は [README.md](README.md)(英語)と [README.ko.md](README.ko.md)(韓国語)にあります。
