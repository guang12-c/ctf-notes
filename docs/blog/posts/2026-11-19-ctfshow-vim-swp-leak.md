---
date: 2026-11-19 16:00:00
slug: ctfshow-vim-swp-leak
categories:
  - 信息收集
  - 源码泄露
---

# ctfshow — vim 临时文件泄露：服务器崩了，源码留在磁盘上

> **题目类型**：信息收集 — vim 交换文件（.swp）泄露源码
>
> **Flag**：`ctfshow{ef6a863e-b17d-42be-b23d-56e6065f6581}`

---

## 题目概述

题目就一句话：

```
发现网页有个错别字？赶紧在生产环境 vim 改下，不好，死机了
```

**这句话不是在讲段子，是在交代“源码曾经被 vim 打开过，而且没正常退出”。**

**靶场默认开 https，浏览器里删掉 `s` 换 http 有时能少踩证书的坑（这题两种都行）。**

---

## 解题过程

### Step 1：读懂提示

**vim 在编辑文件时不是“直接改原文件”，它会生成一个**交换文件（swap file）**放在同目录下。**

**作用有两个：**

```
① 崩溃/断电后能恢复没保存的改动
② 防止两个人同时编辑同一个文件
```

**如果 vim 被异常终止（进程被杀、机器死机、SSH 断线），这个交换文件**不会被删除**，就留在 Web 目录里。**

**而 Web 目录里的东西——能通过 HTTP 直接下载。**

**这就是“vim 临时文件泄露”。**

### Step 2：交换文件叫什么名字

**vim 的命名规则是：在原文件名前面加一个点，后面加 `.swp`。**

```text
原文件      index.php
交换文件    .index.php.swp
```

**如果同一个文件已经被打开过多次（上一次的 swp 没清），后缀会往后排：**

```text
.index.php.swp    第一次
.index.php.swo    第二次
.index.php.swn    第三次
```

**另外还有两种常见的“vim 残留”：**

```text
index.php~          备份文件（backup）
.index.php.un~      undo 文件
```

**扫目录时把这几个后缀一起加上，命中率很高。**

### Step 3：把文件下下来

```powershell
curl.exe -s -k "https://目标/.index.php.swp" -o index.php.swp
```

**用 `-k` 是因为靶场是自签证书。**

**下下来先确认是不是真的 swp：**

```powershell
Format-Hex -Path index.php.swp -Count 64
```

**开头应该是 `b0VIM` 这四个字节（0x62 0x30 0x56 0x49 0x4D）——这是 vim 交换文件的魔数。**

### Step 4：从 swp 里把源码还原出来

**swp 是**二进制**文件（里面是分块保存的文本 + 元信息），**不能直接 `cat` 当源码读**，但文本块是明文存放的，所以有两种办法：**

**① 用 vim 自己恢复（最干净）**

```powershell
vim -r index.php.swp
```

**vim 会提示恢复，确认后 `:w index_recovered.php` 存出来。**

**② 直接抽可打印字符串（最快）**

```powershell
strings index.php.swp | Select-String "flag|<?php|function"
```

**Windows 上没有 `strings` 的话，用 Python 也行：**

```python
import re
data = open("index.php.swp", "rb").read()
print("".join(chr(b) if 32 <= b < 127 else "\n" for b in data))
```

**两种都能看到源码——这题的 flag 就在里面：**

```text
ctfshow{ef6a863e-b17d-42be-b23d-56e6065f6581}
```

---

| 关键点 | 说明 |
| --- | --- |
| 触发条件 | vim 异常退出（死机/断连/被杀），swp 留在 Web 目录 |
| 命名规则 | `.原文件名.swp`，如 `.index.php.swp` |
| 多次打开 | 后缀顺延 `.swo` / `.swn` |
| 其他残留 | `index.php~`（备份）、`.index.php.un~`（undo） |
| 文件特征 | 开头 `b0VIM`（魔数），二进制但文本块明文 |
| 还原方式 | `vim -r xxx.swp` 或 `strings` 抽取 |
| 题目提示的作用 | “死机了”就是在告诉你“没正常退出 → swp 还在” |

---

??? note "目录扫描时该加的后缀"

    ```text
    .swp  .swo  .swn  .swx  .un~  ~  .bak  .old  .orig
    ```

    **dirsearch 里对应 `-e php,swp,swo,swn,bak,old,orig,txt`。**

??? note "这题踩的坑"

    **① 文件名写成 `index..php.swp`**

    多了一个点。**规则是“点 + 原文件名 + .swp”，原文件名本身就带 `.php`，所以是 `.index.php.swp`。**

    **② 把 swp 当普通文本打开**

    它是二进制块文件，直接打开会看到一堆乱码。**用 `vim -r` 恢复，或者用 `strings` 抽可打印字符。**

    **③ 只试了 `.swp` 没试 `.swo`**

    如果那个文件被 vim 打开过两次，第一次的 swp 可能已经变成 swo。**后缀要一起试。**

    **④ 忽略了 `index.php~`**

    备份文件是纯文本，比 swp 还好读。**看到 `~` 结尾的文件优先下它。**
