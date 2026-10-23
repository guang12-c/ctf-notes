# guang's CTF Notes

> Web 安全知识点整理 · 靶场 Writeup · 学习记录

---

## 这里有什么

<div class="grid cards" markdown>

- :material-book-open-variant: **知识点**

    ---

    按主题整理的手册：SQL 注入、文件上传、RCE、路径遍历、代码审计。

    [进入知识点](knowledge/index.md)

- :material-post-outline: **WP 博客**

    ---

    靶场通关记录：现象 → 判断 → 卡点 → 绕法。

    [看 WP](blog/index.md)

- :material-download: **工具字典**

    ---

    SQLi / 命令注入的 fuzz 字典，可直接喂给 Burp Intruder。

    [取字典](files/index.md)

</div>

## 学习路线

```text
SQL 注入 ──┐
文件上传 ──┼──> Web 漏洞基础
命令注入 ──┤
代码执行 ──┘
    │
    └──> 代码审计(把点串成面)
```

## 记录原则

| 记什么 | 怎么记 |
|---|---|
| **知识点** | 按主题归类，只写"判断依据"和"为什么有效" |
| **WP** | 按时间倒序，重点写**卡在哪、怎么想到的** |
| **踩的坑** | 每条坑都写"现象 → 原因 → 正确做法" |

> 目标不是攒 payload，而是攒**判断力**。
