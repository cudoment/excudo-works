# excudo-works

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | 简体中文

为 Excudo 工作区增加每日自动化和可编辑的每周报告。
原则和判断标准由使用者自己决定。
需要 Node 22.16 或更高版本，以及 Excudo `^0.8.0`。支持 macOS、Linux 和 Windows。
本产品只提供英文和韩文。本指南是为中文读者准备的说明，生成的文件和备忘录使用英文(`en`)。

## 五分钟开始

先用引擎创建工作区，再在其中添加本软件包。不会在当前所在的文件夹里安装任何东西。

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

如果 `doctor` 显示 `activity` 警告，请在 `excudo.config.mjs` 中开启 `conversations`。
这样引擎会读取你发给编码代理的请求，从中学习并创建技能。
已有的配置、策略和使用者的技能文件夹都会保留。
请打开生成的 `weekly.md`，查看每周报告。

## 用编码代理安装

把下面这句话粘贴到编码代理(如 Claude Code、Codex)中。

> Set up Excudo Works from https://github.com/cudoment/excudo-works in a new folder, following the section "用编码代理安装" of its README.zh-CN.md

含义：请在一个新文件夹中，从 https://github.com/cudoment/excudo-works 安装 Excudo Works，并按照其 README.zh-CN.md 中 "用编码代理安装" 一节操作。

代理遵守以下规则：

- 要求 Node 22.16 或更高版本(https://nodejs.org)，版本过低时给出该链接并停止。
- 只问一次文件夹名称。不询问语言，使用 `en`。用文件夹名称替换 `my-work`，两处 `--locale` 的值都保持 `en`，其他内容一律不改。
- 无论 `--locale` 的值是什么，都继续用使用者的语言(中文或其他语言)与使用者交流。
- 不做全局安装，只使用 `npx -y` 和项目内的 `npm install`。
- 运行 "五分钟开始" 中的第一条命令 `npx -y excudo@^0.8.0 init my-work --locale en`。`init` 之后，只确定一次新文件夹的绝对路径(例如当前文件夹加上 `my-work`)。此后的所有命令都在该文件夹内分成下面两行运行。每一行都以 `cd <绝对路径>` 开头，用完整路径替换占位符，因此无论 shell 当前在哪个文件夹都能运行。
- 第一行安装引擎并报告状态。`init` 不会运行 git，所以 `git init` 包含在这一行中。
  `cd <absolute folder path> && npm install && git init && npx --no-install excudo start --report --json`
- 阅读报告。`workspace`、`install`、`git`、`skills` 四个步骤必须全部是 `done`。`start --report` 无论结果如何退出码都是 0，所以要自己检查这些步骤。只要有一个不是 `done`，就停止，展示它的 `id` 和 `state`，并询问使用者。不要运行第二行。
- 只有四个步骤都是 `done` 时，才运行安装本软件包的第二行。
  `cd <absolute folder path> && npm install --save-dev excudo-works@^0.2.0 && npx --no-install excudo-works init . --locale en && npx --no-install excudo-works doctor && npx --no-install excudo-works run --manual --only report`
- 报告中的四个步骤都是 `done`，并且 `doctor` 通过，安装就算验证完成。
- 命令失败时，不要猜测修复办法，应停止并展示错误输出的末尾部分。
- 告诉使用者下一步：打开生成的 `weekly.md`，处理 `activity` 之类的 `doctor` 警告。

## 更新

用下面的命令查看注册表中的新版本、已安装版本的发布说明和更新命令。

```sh
npx --no-install excudo-works update
```

`update` 在离线时也会更新本地记录和链接。
加上 `--apply` 会运行显示出的安装命令，并用新版本迁移记录。
需要使用者操作的变更，会在更新日志的 "Owner action" 下最先列出。

## 报告问题

用下面的命令显示本地的 Issue 草稿和创建 Issue 的链接。

```sh
npx --no-install excudo-works feedback
```

草稿不会自动发送。请先检查内容，再自行发布到 https://github.com/cudoment/excudo-works/issues。

## 完整参考

所有设置、命令和细节请见 [README.md](README.md)(英文)和 [README.ko.md](README.ko.md)(韩文)。
