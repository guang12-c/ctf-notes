# 工具与字典

可以直接下载，喂给 Burp Intruder。

## 字典

| 文件 | 行数 | 用途 |
|---|---|---|
| [sqli-fuzz-payloads.txt](sqli-fuzz-payloads.txt) | 137 | SQLi 关键词/符号/编码分组的 fuzz 字典 |
| [sqli-fuzz-bypass.txt](sqli-fuzz-bypass.txt) | 193 | SQLi 大小写变体 + 双写绕过 |
| [01-分隔符.txt](01-分隔符.txt) | 7 | 命令注入：`;` `\|` `\|\|` `&` `&&` `%0a` |
| [02-关键词.txt](02-关键词.txt) | 48 | 命令注入：命令名 + 文件名，一行一个 |
| [03-符号.txt](03-符号.txt) | 26 | 命令注入：`$IFS` `<` `*` `?` 引号 编码 |
| [按位取反构造payload.py](按位取反构造payload.py) | — | 字符 → 按位取反 → URL 编码 |

## 用法要点

!!! tip "一行一个，别组合"

    原子字典的价值在于**归因**：失败时能确定是哪个词被拦，
    而不是"这条 payload 里不知道哪一段坏了"。

测试时用的是**固定模板 + 一个变量**：

```text
测分隔符:   127.0.0.1§§id
测命令名:   127.0.0.1;§§$IFS/flag
测文件名:   127.0.0.1;cat$IFS/§§
测符号:     127.0.0.1;cat§§/flag
```

!!! warning "别开 URL-encode"

    字典里的 payload 已经用 `$IFS` 避开了空格，
    开编码会把 `$` 变成 `%24`，整条失效。

## 演示页

| 页面 | 演示什么 |
|---|---|
| [XSS 复现页说明](xss/) | 三页的用法与边界（先看这个） |
| [XSS level4 复现](xss/level4_repro.html) | `location.href` 汇点 + `javascript:` 伪协议（含 `escape()` 对比） |
| [XSS level5 复现](xss/level5_repro.html) | `form.action` + 自动 `submit()`，带自检判断到底有没有执行 |
| [XSS level6 复现](xss/level6_repro.html) | AngularJS 1.4.6 模板注入，`{{7*7}}` → 49，可换 payload 重试 |

!!! tip "为什么要单独做复现页"

    原题把漏洞点埋在倒计时、表单自动提交、模板编译里，
    一眼看不出是哪一句在起作用。复现页把干扰逻辑拆掉，只留那一句赋值，
    **先看清"哪一行是洞"，再回原题。**
