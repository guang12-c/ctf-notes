---
date: 2026-11-19 16:20:00
slug: ctfshow-probe-leak
categories:
  - 信息收集
  - 源码泄露
---

# ctfshow — 探针泄露：一个 tz.php 把整台机器摊在页面上

> **题目类型**：信息收集 — 服务器探针（phpinfo）泄露环境信息
>
> **Flag**：`ctfshow{b331ef56-d57c-4486-a229-0fa42200b6bf}`

---

## 题目概述

进去是个普通页面，看不出东西。**这题考的不是漏洞，是“服务器上不该存在的文件”。**

**服务器探针**是运维用来排查环境的小工具（PHP 版本、扩展、路径、环境变量全列出来）。**忘了删，就等于把机器的体检报告挂在公网上。**

---

## 解题过程

### Step 1：先猜探针文件名

**探针文件名没有标准，但圈内有几个“约定俗成”的：**

```text
tz.php        ← 这题用的（雅黑探针系列）
y.php
i.php
l.php
p.php
x.php
info.php
phpinfo.php
test.php
1.php
```

**为什么是这几个：**探针类工具（雅黑探针、iProber 等）默认文件名就是这些短名，很多人下载后直接丢到根目录不改名。

**扫目录时把 `php` 后缀配上这几个单词；实在扫不出来，也可以手工挨个试——都是 GET，成本很低。**

### Step 2：探针页面 → 点 phpinfo

**访问 `tz.php`，会看到一个功能页，上面有服务器信息汇总，还有几个链接，其中一个就是 `phpinfo()`。**

**点进去之后，页面变成一大坨信息：**

```
PHP Version         7.3.11
System              Linux ...
Server API          FPM/FastCGI
Loaded Configuration File
Environment          ← 重点
PHP Variables        ← 重点
```

**`phpinfo()` 会把当前进程的**环境变量**整段打印出来。**

**而很多部署方式（Docker、docker-compose、K8s）会把 flag 作为环境变量注入容器——因为写进文件容易被镜像带上，放环境变量“看起来安全”。**

### Step 3：在页面里找 flag

**phpinfo 页面非常长，靠肉眼翻基本翻不到。用浏览器搜索：**

```
Ctrl + F  →  输入 flag  →  回车
```

**命中之后会高亮，直接看右边那一列的值：**

```text
FLAG    ctfshow{b331ef56-d57c-4486-a229-0fa42200b6bf}
```

**如果是命令行，就更省事：**

```powershell
curl.exe -s -k "https://目标/tz.php" | Select-String -Pattern "flag"
```

**或者直接抓 phpinfo 输出并过滤：**

```powershell
curl.exe -s -k "https://目标/phpinfo.php" | Select-String -Pattern "FLAG"
```

---

| 关键点 | 说明 |
| --- | --- |
| 探针 | 运维排查用的小工具，暴露版本/路径/扩展/环境变量 |
| 常见文件名 | `tz.php`、`y.php`、`i.php`、`info.php`、`phpinfo.php`、`1.php` |
| phpinfo 的价值 | `Environment` 区块包含进程环境变量 |
| 为什么 flag 在环境变量 | 容器部署时常把敏感值放 env，避免写进镜像文件 |
| 怎么快速定位 | 浏览器 `Ctrl+F` 搜 `flag`，或 `curl \| Select-String` |
| 这类文件为什么危险 | 除了 flag，还可能泄露数据库账号、内部路径、AK/SK |

---

??? note "命令行一把梭"

    ```powershell
    # 先找探针
    foreach ($p in "tz.php","y.php","i.php","info.php","phpinfo.php","1.php") {
      $code = curl.exe -s -o NUL -w "%{http_code}" -k "https://目标/$p"
      if ($code -eq "200") { Write-Output "$p 存在" }
    }

    # 再搜 flag
    curl.exe -s -k "https://目标/tz.php" | Select-String "flag"
    ```

??? note "这题踩的坑"

    **① 只看首页**

    探针不在首页链接里，得自己敲路径。**这类题的关键动作是“猜文件名”，不是“看页面”。**

    **② 进了探针页就停住**

    探针页只是汇总，**真正有 env 的是它里面的 `phpinfo()` 子页面**，还得再点一次。

    **③ 肉眼翻 phpinfo**

    页面几千行，翻不到很正常。**`Ctrl+F` 搜 `flag` 是最快的，其次是 `Select-String`。**

    **④ 只搜“环境变量”一个区块**

    有些题把 flag 放在 `PHP Variables` 或 `$_SERVER` 里。**搜关键字比找区块快。**
