# 文件包含

> **一句话：应用把用户的输入拼进了 `include`，于是你能让它加载任意文件。**

## 核心模型

```text
入口:  ?page= / ?file= / ?template=
  ↓
拼接:  include $_GET['page']
  ↓
利用:  伪协议读源码 → 日志/session 包含 → RCE
```

## 章节

| 章 | 内容 |
|---|---|
| 一~二 | 判断方法、LFI 与 RFI |
| **三** | **伪协议全家桶**（php://filter / input / data / phar / zip） |
| **四** | **五个路径技巧**：`../`、`?` 截断、`%00`、长度、`?/../` 词法折叠 |
| **五** | **从读文件到 RCE 的五条路**：日志、session、environ、php://input、上传+包含 |
| 六 | 敏感路径清单 |
| 七 | 实战记录（WarmUp、ZJCTF 已完成） |
| 八 | 四个坑 |
| 九 | 一句话总结 |

## 最常用的两条

```text
读源码:  ?file=php://filter/convert.base64-encode/resource=index.php
要执行:  ?file=php://input   (POST body 放 PHP 代码,需 allow_url_include=On)
```
