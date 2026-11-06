# XSS 专题

> **数据越界变成了代码。**SQL 里是逃出引号，SSTI 里是逃出 `{{ }}`，XSS 里是逃出"文本"。

---

## 一、XSS 是什么

**浏览器拿到 HTML 就按语法解析。服务器如果把你输入的内容原样拼进 HTML，你写的 `<` 就不再是"小于号"，而是"标签开始"。**

```text
正常:  <span>welcome xss</span>
注入:  <span>welcome <img src=x onerror=alert(1)></span>
                      └──────────── 数据变成了标签 ────────────┘
```

**三种类型，区别只在"数据从哪来、存在哪、什么时候被执行"：**

| 类型 | 数据路径 | 特点 |
|---|---|---|
| 反射型 | URL → 服务端 → 立刻回显 | 要骗人点链接 |
| 存储型 | 输入 → 数据库 → 别人打开页面 | 不需要骗，等人来看 |
| DOM 型 | URL → 前端 JS 直接取用 | 服务端日志里看不到 payload |

**危害不在"弹窗"，在同源下的任意 JS：读 cookie、替用户操作、改页面钓鱼、打后台管理员。**

---

## 二、识别：只看一件事——上下文

**payload 不是背出来的，是上下文决定的。**第一步永远是看你的输入落在哪儿：

| 落点 | 例子 | 闭合方式 |
|---|---|---|
| HTML 标签之间 | `<span>welcome {{输入}}</span>` | `<script>`、`<img onerror>` |
| HTML 属性里 | `<input value="{{输入}}">` | 引号闭合属性 + 事件 |
| JS 单引号串 | `var u = '{{输入}}'` | `'` 闭合引号 |
| `innerHTML` | `el.innerHTML = 输入` | `<img onerror>`（**script 不执行**） |
| URL 汇点 | `location.href = 输入` | `javascript:` 伪协议 |
| 模板表达式 | `{{ }}` / `v-html` | 表达式 + 沙箱逃逸 |

**判断动作只有一个：`view-source` 搜你的字符串，看它左右两边是什么符号。**引号？标签？`+`？`{}`？

### 探针

```html
<img src=x onerror=alert(1)>      最通用：不用闭合任何东西，会自己触发
"><img src=x onerror=alert(1)>    属性上下文
';alert(1)//                      JS 字符串上下文
{{7*7}}                           模板上下文：回显 49 才说明被执行
```

---

## 三、关键认知：转义必须按上下文

**最容易骗人的一种写法：**

```js
var username = '<用户输入>';                                              // ① 服务端拼进 JS 字符串
document.getElementById('ccc').innerHTML = "Welcome " + escape(username);  // ② 前端才转义
```

**看到 `escape()` 会以为没戏了。但 `escape()` 保护的是 ② 这个汇点，保护不了 ① 那个更早的 JS 字符串汇点。**

```text
输入:  ';alert(1)//
结果:  var username = '';alert(1)//';
```

**同一条数据流上有多个汇点，只防住后面那个等于没防。**

**第二条：`escape()` 本身也不全。**HTML 转义表里只有 `& < > " '`，没有 `{ }`——它挡得住标签，挡不住模板表达式（见第六章）。

**结论：转义是"在哪里用"的问题，不是"用不用"的问题。**

---

## 四、DOM 型：sink 清单

**服务端不回显也可能中招。数据在浏览器里从 source 流到 sink，全程不过服务器。**

```text
source: location.search / location.hash / document.referrer / postMessage / localStorage
sink:   下面这些
```

| sink | 备注 |
|---|---|
| `location.href` / `location.assign` / `location.replace` / `location =` | URL 汇点 |
| `form.action` | 提交表单时触发（见第五章） |
| `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` | HTML 汇点，script 不执行 |
| `eval` / `Function` / `setTimeout(字符串)` / `setInterval(字符串)` | JS 汇点 |
| `a.href` / `iframe.src` / `window.open` | URL 汇点 |
| `$()` / `.html()` / `.append()` | jQuery 系 |
| `{{ }}` / `v-html` / `ng-bind-html` | 模板汇点 |

**找 DOM XSS 就是搜这张表，不是搜 payload。**

---

## 五、伪协议：把"跳转"变成"执行"

**`location.href = 某个字符串` 时，浏览器先看开头的 scheme，决定"交给谁处理"：**

```text
https://a.com/x     → 网络请求
/level5             → 相对路径，请求本站
javascript:...      → 不请求任何资源，把后面内容当 JS 在本文档执行
```

**所以 `location.href = "javascript:alert(1)"` 不是"跳到一个叫 javascript 的网站"，是"执行 alert(1)"。**

**同一个坑还有第二个入口：表单。**`form.action` 也是 URL，`submit()` 就是一次导航：

```js
autoForm.action = "javascript:alert(1)";
autoForm.submit();        // 代码调用，不需要用户点按钮
```

**两个容易被忽略的点：**

```text
① submit() 是代码调用的 —— 所以"没人会点按钮"不成立
② method="POST" 不影响 —— javascript: 根本不产生请求
```

**判断依据：只要代码把一个可控字符串塞进 URL 汇点，就问一句"这个位置接受什么 scheme"。**

---

## 六、模板注入：框架替你执行

**Angular / Vue 这类框架会主动扫描 DOM，把 `{{ }}` 当表达式求值。客户端版本叫 CSTI，服务端版本就是 SSTI（本库有独立专题）。**

```html
<span>welcome {{7*7}}</span>      → 渲染成 welcome 49
```

**为什么 HTML 转义挡不住？因为转义表里没有花括号。**`<` 变成 `&#x3c;` 了，`{{ }}` 原样进了模板。

**从"能算"到"能执行"中间隔着沙箱。**以 AngularJS 1.4.6 实测：

| 表达式 | 结果 | 含义 |
|---|---|---|
| `{{7*7}}` | `49` | 表达式被执行 |
| `{{$eval('1+1')}}` | `2` | `$eval` 可访问，能在表达式里再求值一段字符串 |
| `{{$eval('alert(1)')}}` | `s.alert is not a function` | 表达式里的名字走 scope，摸不到全局 |
| `{{constructor.constructor('alert(1)')()}}` | `$parse:isecfn` | 1.4.6 沙箱拦 Function，**这句是 1.6+ 才通用的** |
| `{{'a'.constructor.prototype.charAt=[].join;$eval('x=1} } };alert(1)//');}}` | 弹窗 | 砸坏编译器 + 二次求值 |

**那串长 payload 拆成两段：**

```text
① 'a'.constructor.prototype.charAt = [].join     把编译器内部搞坏
② $eval('x=1} } };alert(1)//')                    用 } } } 跳出生成的函数体
```

| 组合 | 结果 |
|---|---|
| 只做 ① | 还是 `s.alert is not a function`（scope 没被绕过） |
| 只做 ② | 解析器报语法错误（`}` 不是合法 token），字符串进不去编译 |
| ① + ② | 成功：尾巴被当成**原始 JS** 拼进生成函数的 body，`alert` 是全局的 |

**成功时 Console 会报 `TypeError: Cannot set properties of undefined (setting 'literal')`——那是"编译器被砸坏"的声音，不是失败。**报错在这一关是成功的证据。

---

## 七、判断"到底执行了没有"

**四种完全不同的原因，别混：**

| 现象 | 原因 | 下一步 |
|---|---|---|
| 显示成文字 | 被转义了（编码发生在你没想到的那层） | 换上下文，看还有没有别的汇点 |
| 标签在，但没反应 | `innerHTML` 不执行 `<script>` | 换事件属性 `<img onerror>` |
| Console 报 CSP 拒绝 | 策略拦的，不是转义 | 找不用 inline 的路径（伪协议也受 `script-src` 管） |
| 弹窗了但内容不对 | 有东西改写了 `alert` | 判断看副作用，不看弹窗文字 |

**最稳的判断方式：不看弹窗，看副作用。**`alert(document.domain)`、Console 报错、Network 里的新请求，任选其一。

---

## 八、防御

| 层 | 做法 | 挡什么 |
|---|---|---|
| 输出编码 | 按上下文编码（HTML 实体 / JS 转义 / URL 编码） | 逃出文本 |
| 富文本 | 白名单净化（DOMPurify） | 标签注入 |
| URL 汇点 | 只放行 `http:` / `https:` | `javascript:` |
| 前端 | `textContent` 代替 `innerHTML` | HTML 汇点 |
| 模板 | 用户数据只走绑定，永不当模板源码 | CSTI |
| Cookie | `HttpOnly` | 降低盗号危害（不防 XSS 本身） |
| CSP | `script-src` 不含 `unsafe-inline` / `unsafe-eval` | 兜底 |

**CSP 那条有代价：Angular 1.x 的 `$parse` 用 `new Function` 生成代码，必须有 `unsafe-eval` 才能跑。所以"老框架"和"严格 CSP"天生不共存。**

---

## 九、实战记录：n1book XSS 闯关（六关）

**DASCTF 上部署的 n1book 靶场，六关加一个 flag 页。每关都是同一句话的变体，换的只是 sink。**

| 关 | source | sink | 弹药 |
|---|---|---|---|
| 1 | `?username` | 服务端拼进 HTML | `<script>alert(1)</script>` |
| 2 | `?username` | 拼进 JS 单引号串（`escape` 在后面） | `';alert(1)//` |
| 3 | `?username` | `innerHTML` | `<img src=x onerror=alert(1)>` |
| 4 | `?jumpUrl` | `location.href` | `javascript:alert(1)` |
| 5 | `?action` | `form.action` + `submit()` | `javascript:alert(1)` |
| 6 | `?username` | Angular 模板 | `{{ }}` + 沙箱逃逸 |

**几处实测到的细节：**

```text
① 第 3 关服务端完全不转义，但 innerHTML 不执行 <script>，只能靠事件属性
② 第 4 关显示那句话用了 escape()，赋值那句没用 —— 转义加错了位置
③ 第 5 关 POST /level5 返回 404（Cannot POST /level5），
   所以"让表单提交给自己"这条正常路是死的，只剩伪协议
④ 第 6 关服务端把 < 转成 &#x3c;，{{ }} 原样保留 —— 过滤是按"标签"想象的
⑤ 第 7 关直接访问就给 flag，进度校验只在 main.js 里 —— 客户端状态不可信
```

**前五关是浏览器在解析，第六关是框架在解析。六种弹药，一条主线。**

**想自己动手：** [第 4 关复现页](../../files/xss/level4_repro.html) / [第 5 关复现页](../../files/xss/level5_repro.html) / [第 6 关复现页](../../files/xss/level6_repro.html)。复现页把倒计时、表单、模板这些干扰拆开，只留漏洞点，可以逐条点着试。

---

## 十、十个坑

| # | 坑 | 现象 | 正解 |
|---|---|---|---|
| 1 | 看到 `escape()` 就放弃 | 以为没戏 | 转义在赋值之后，前面的 JS 字符串汇点没被保护 |
| 2 | 往 `innerHTML` 里塞 `<script>` | 标签在，不执行 | 换 `<img onerror>`、`<svg onload>` |
| 3 | 只测 `<script>` | 被过滤就以为无解 | 事件属性、伪协议、模板表达式都是弹药 |
| 4 | `alert` 弹了但内容不对 | 以为打偏了 | 靶场改写了 `alert`；判断看副作用 |
| 5 | 报错就以为失败 | Console 有红字 | 沙箱逃逸成功时也会报错（编译器被打坏） |
| 6 | 抄 1.6+ 的 `constructor.constructor` | 1.4.6 上不弹 | 老版本有沙箱，要 `charAt` + `$eval` |
| 7 | payload 里带 `=` 或 `&` | 参数被切碎 | 参数解析按 `=` `&` 切，payload 要么避开，要么先编码 |
| 8 | 服务端不回显就放弃 | "没有回显" | DOM 型根本不经过服务端，去看前端 sink |
| 9 | 转义了 `<>` 就以为安全 | 属性上下文仍有洞 | 属性里要闭合引号；模板里花括号不受影响 |
| 10 | 拿"弹窗"当成功标准 | 实战没弹窗但有执行 | 用 `document.domain` 或请求副作用判断 |

---

## 十一、一句话总结

> **XSS 的本质是：你的数据越界，变成了页面语法的一部分。**
>
> **入门只看一件事：我的输入落在哪种语法里——上下文决定 payload。**
>
> **三种弹药够用：标签（HTML）、闭合引号（JS 字符串）、伪协议（URL 汇点）。**
>
> **判断永远比 payload 重要：是没执行，还是执行了看不到？**
