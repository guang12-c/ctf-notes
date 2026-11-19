---
date: 2026-11-19 20:50:00
slug: myctf-save-nailong
categories:
  - Web
  - 前端审计
---

# save_nailong — 六道门后面，钥匙写在 game.js 里

> **题目类型**：前端代码审计 — 全局函数 + 被 base64 藏起来的跳转参数
>
> **Flag**：`MYCTF{n1l0ng_r3scu3d_1n_th3_fr0nt3nd}`

---

## 题目概述

剧情给了三句关键信息：

```
值班表上留了一行字：「深渊·加班之神」，六道门，它在最后一道后面。
你只有 3 分钟，一把剑，和十点伤害。
```

**“六道门”“最后一道后面”——暗示这游戏本身是障眼法，**答案在代码里，不在游戏里**。**

---

## 解题过程

### Step 1：先正常玩一局，看有没有网络请求

**F12 打开网络面板打一局，结果很干净：**

```
只有 game.js
攻击的时候没有任何请求
```

**Burp 也抓不到东西——说明这个游戏**完全在前端跑**，没有任何后端交互。**

**那就说明：flag 不在后端，在 JS 里。**

### Step 2：看 game.js（先解决乱码）

**直接打开 `game.js`，中文全是乱码。**

**原因：服务器返回的 `Content-Type` 里没带 `charset`，浏览器就按系统默认编码（GBK）去解 UTF-8 的文件。**

**三种查看方式，任选：**

```powershell
# ① 下下来，按 UTF-8 打开
curl.exe -o game.js "http://目标/game.js"

# ② 直接转换输出
curl.exe -s "http://目标/game.js" | python -c "import sys;sys.stdout.write(sys.stdin.buffer.read().decode('utf-8'))"

# ③ DevTools → 调试器（Sources），它自己会按 UTF-8 显示
```

**第 ③ 种最省事——浏览器开发者工具里的源码视图不受响应头影响。**

### Step 3：拉到最下面

**文件头部是模块说明，写着“13 本地验收残留（考点，勿删）”——作者自己把考点标出来了。**

**直接拉到尾部，看到这段：**

```javascript
var SAVE_TAG = ['bjFsMG5n', 'X2IzYXNy', 'XzIwMjY='];

function devGate() {
  location.href = 'nailong.php?pass=' + SAVE_TAG.map(atob).join('');
}
window.devGate = devGate;
```

**三件事：**

```
① SAVE_TAG 三段 base64，map(atob) 解码后 join 起来
② devGate() 拼成 nailong.php?pass=xxx 并跳转
③ window.devGate = devGate —— 这个函数被显式挂到了全局
```

### Step 4：解码，或者直接调它

**手动解码：**

```
bjFsMG5n   →  n1l0ng
X2IzYXNy   →  _b3asr
XzIwMjY=   →  _2026
```

**拼起来：**

```text
n1l0ng_b3asr_2026
```

**于是访问：**

```text
/nailong.php?pass=n1l0ng_b3asr_2026
```

**更快的办法——直接在控制台敲：**

```javascript
devGate()
```

**因为 `window.devGate = devGate;`，它是全局的。**

**跳转过去，拿到：**

```text
MYCTF{n1l0ng_r3scu3d_1n_th3_fr0nt3nd}
```

### Step 5：为什么只有 `devGate` 能直接调

**整个 game.js 包在一个立即执行函数里：**

```javascript
(function () {
  'use strict';
  var SAVE_TAG = [...];
  var state = {...};
  function devGate() {...}
  window.devGate = devGate;   // ← 唯一主动暴露的
})();
```

**IIFE 的意思是“函数定义完立刻调用”——里面的所有变量和函数都是**私有的**，外部拿不到。**

**只有作者用 `window.xxx = ...` 显式挂上去的，才会变成全局。**

**所以：**

```
devGate        ✅ 能用（被挂到 window）
SAVE_TAG       ❌ 用不了（私有）
state          ❌ 用不了（私有）
```

### Step 6：另一种玩法——改伤害（打不死，但方法值得学）

**代码里初始伤害是 10 点，boss 血很厚。想改 `state.atk = 999999`，但 `state` 是私有的，控制台直接赋值会报 `not defined`。**

**解决办法：**打断点**。**

```
① DevTools → 调试器（Sources）→ 在 attack 相关的函数里点行号打断点
② 点一次攻击，代码停住
③ 此时在 Console 里执行：
   state.atk = 999999
```

**为什么突然就能改了：**断点停住时，**执行上下文就在那个函数内部**，Console 用的是**当前作用域的上下文**——所以能看到并改写 `state`。**

**可惜这条路走不通：**把 boss 打死什么都不发生，**没有 flag**。这游戏是纯前端演出，通关不代表什么。

---

| 关键点 | 说明 |
| --- | --- |
| 浏览器里抓不到包 | 游戏全在前端跑，flag 只能从 JS 里找 |
| 中文乱码 | 响应头没带 `charset`，浏览器按 GBK 猜；用 DevTools 或存下来按 UTF-8 看 |
| `SAVE_TAG` | 三段 base64，`map(atob).join('')` 拼成密码 |
| 全局函数 | `window.devGate = devGate` 是唯一暴露到全局的入口 |
| IIFE 作用域 | 函数内变量默认私有，外部访问不到 |
| 断点改私有变量 | 断点命中时 Console 用函数作用域，可读写局部变量 |
| 打死 boss 没用 | 通关是演出，flag 在 `nailong.php?pass=` 后面 |

---

??? note "完整操作"

    ```javascript
    // 方式一：控制台直接调
    devGate()

    // 方式二：手动拼 URL
    // n1l0ng + _b3asr + _2026 = n1l0ng_b3asr_2026
    // 访问 /nailong.php?pass=n1l0ng_b3asr_2026
    ```

??? note "这题踩的坑"

    **① 一直在玩游戏**

    这题的“游戏”是壳。**六道门、三分钟、十点伤害——全是干扰项。**

    **② 看到乱码就跳过**

    乱码不是文件坏了，是**编码判断错了**。换一个查看方式就能读到中文提示。

    **③ 想在控制台直接改 `state`**

    IIFE 里的 `var` 外部拿不到。**必须靠断点进入作用域，或者找作者特意暴露的全局变量。**

    **④ 以为打死 boss 有奖励**

    这条路的收益是零。**看懂“谁是全局的”比打赢重要。**
