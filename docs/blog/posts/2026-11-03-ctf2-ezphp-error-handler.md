---
date: 2026-11-03 18:30:00
slug: ctf2-ezphp-error-handler
categories:
  - PHP
  - 代码审计
  - Web
---

# [CTF2] EZPHP — 条件永远为假，但错误处理器会说话

> **题目类型**：Web — PHP 代码审计，利用 `set_error_handler` 触发信息泄露
>
> **Flag**：`CTF2{558d08e2-3e2c-43bc-be5b-6058c095641b}`

---

## 题目概述

页面给了一段 PHP 源码（`highlight_file(__FILE__)` 把自身打印出来），底下永远显示 `Try harder!`。

---

## 解题过程

### Step 1：先读代码

```php
<?php
highlight_file(__FILE__);
include "fl4g.php";
$dest0g3 = $_POST['ctf'];
$time    = date("H");
$timme   = date("d");
$timmme  = date("i");

if(($time > "24") or ($timme > "31") or ($timmme > "60")){
    echo $fl4g;
}else{
    echo "Try harder!";
}

set_error_handler(
    function() use(&$fl4g) {
        print $fl4g;
    }
);
$fl4g .= $dest0g3;
?>
```

### Step 2：第一个想法——绕开那个 if

**`include` 已经把 `fl4g.php` 引进来了，那直接让 `if` 成立不就能输出 `$fl4g` 了吗？**

**看三个判断：**

```text
date("H")   小时   00–23     永远不可能 > 24
date("d")   日期   01–31     永远不可能 > 31
date("i")   分钟   00–59     永远不可能 > 60
```

**三个都是“边界值本身等于上限”的情况，所以整条 `or` 永远是假。这条路封死。**

### Step 3：真正的入口在下面

```php
set_error_handler(function() use(&$fl4g){ print $fl4g; });
$fl4g .= $dest0g3;
```

**`set_error_handler` 注册了一个自定义处理器——**只要发生能被它捕获的错误，就会执行里面的 `print $fl4g`**。**

**而下一行就是触发器：`$fl4g .= $dest0g3`。**

### Step 4：让拼接出错

**`$dest0g3` 来自 `$_POST['ctf']`，类型完全由我们决定。**

**如果传一个**字符串**，拼接正常，什么都不会发生。**

**如果传一个**数组**，PHP 试图把数组转成字符串来拼接，转不了——抛出 `Warning: Array to string conversion`。**

**这个 warning 被刚刚注册的处理器捕获，于是 `print $fl4g` 执行，flag 就出来了。**

```text
POST ctf[]=1
→ Array to string conversion
→ error handler
→ 打印 $fl4g
```

---

## 解题思路总结

```text
读源码 → include 了 fl4g.php，但 if 永远为假（小时≤23、日≤31、分≤59）
       → 往下看，set_error_handler 注册了 print $fl4g
         → 找触发器：$fl4g .= $_POST['ctf']
           → 传数组 → 拼接失败 → warning → 处理器执行 → 拿到 flag
```

### 漏洞原理

**① 错误处理器会把“错误”变成“输出”**

**`set_error_handler` 本来是用来记日志、兜异常的，但它注册的回调里做了什么，就是另一回事。**这题的回调里是 `print $fl4g`——**等于把“出错”这个事件接了一根线到“泄露变量”上。**

**② 数组与字符串拼接会抛 warning**

**PHP 允许很多隐式类型转换，但**数组转字符串不在其中**。`$str .= $array` 不会静默失败，它会抛 `Array to string conversion`。**

**这个 warning 默认是**不致命**的，页面照常返回——但 `set_error_handler` 能接住它。**

**③ 参数类型可控，是最容易被忽略的输入面**

**`$_POST['ctf']` 不一定是字符串。**在表单里写成 `ctf[]=1`，PHP 就会把它解析成数组。**很多开发者的防御只考虑了“值”，没考虑“类型”。**

### 关键知识点

| 知识点 | 说明 |
|---|---|
| `date("H")` / `"d"` / `"i"` | 小时 00–23、日 01–31、分 00–59，与判断边界相同，永远不可能大于 |
| `set_error_handler` | 注册自定义错误处理函数，可捕获 warning/notice |
| `Array to string conversion` | 数组与字符串拼接时抛出的 warning，被处理器接住 |
| `ctf[]=1` | 表单里这样写，后端 `$_POST['ctf']` 就是数组 |
| `use (&$fl4g)` | 引用捕获，让闭包能读到外部变量 |

---

??? note "完整源码"

    ```php
    <?php
    highlight_file(__FILE__);
    include "fl4g.php";
    $dest0g3 = $_POST['ctf'];
    $time    = date("H");
    $timme   = date("d");
    $timmme  = date("i");
    if(($time > "24") or ($timme > "31") or ($timmme > "60")){
        echo $fl4g;
    }else{
        echo "Try harder!";
    }
    set_error_handler(
        function() use(&$fl4g) {
            print $fl4g;
        }
    );
    $fl4g .= $dest0g3;
    ?>
    ```

??? note "这题踩的坑"

    **① 一开始死磕那个 if**

    **三个条件都卡在边界上（≤23、≤31、≤59），不是“运气不好没凑上”，是**设计上就不可能**。看到这种精度边界，就该立刻换路。**

    **② 把 warning 当成“不影响”**

    **warning 确实不中断脚本，但这题的整个入口就在“warning 会被谁接住”上。****错误级别不重要，谁在处理它才重要。**
