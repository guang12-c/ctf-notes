# 维护手册（MAINTENANCE）

> **给「新会话里的 AI」看的交接文档。**
>
> 如果你（AI）是刚接入这个项目、对这个网站一无所知，**先读完这一份**，
> 然后你就知道它是怎么搭的、怎么改、怎么发布、有哪些坑。
>
> 最后更新：2026-10-23

---

## 0. 三十秒速览

| 项 | 值 |
|---|---|
| **站点** | https://guang12-c.github.io/ctf-notes/ |
| **仓库** | https://github.com/guang12-c/ctf-notes |
| **本地目录** | `E:\dsh\ctf-notes` |
| **技术栈** | MkDocs + Material for MkDocs（纯静态） |
| **部署** | GitHub Actions 自动部署，push 到 `main` 即上线 |
| **作者** | guang（GitHub: `guang12-c`） |
| **内容** | CTF / Web 安全学习笔记 + 靶场 WP |

**一句话：写 Markdown，`git push`，约 1 分钟后网站更新。**

---

## 1. 目录结构

```text
E:\dsh\ctf-notes\
├── mkdocs.yml                  ← 唯一的配置文件（导航、主题、插件）
├── README.md                   ← 给「人」看的说明（写 WP 的步骤）
├── MAINTENANCE.md              ← 本文件（给 AI 看的交接，不在网站上显示）
├── requirements.txt            ← mkdocs-material
├── .gitignore                  ← 排除 site/、preview/、临时目录
├── .gitattributes              ← 统一 LF 换行
├── .github\workflows\deploy.yml ← 自动部署工作流
├── docs\                       ← 只有这里的内容会发布
│   ├── index.md                ← 首页
│   ├── knowledge\              ← 【知识点区】左侧树形目录
│   │   ├── index.md
│   │   ├── sql\                ← 8 个 md（原理/速查/卡点/lab记录/盲注/OOB/报错/逐行讲解）
│   │   ├── upload\             ← 文件上传专题（14 章）
│   │   ├── rce\                ← RCE 专题（14 章，命令注入+代码执行）
│   │   ├── traversal\          ← 路径遍历专题（10 章，六关全通）
│   │   ├── web\                ← CTF-Web 学习笔记（PortSwigger 13 关）
│   │   └── audit\              ← 代码审计入门
│   ├── blog\                   ← 【WP 区】按时间倒序
│   │   ├── index.md            ← 博客首页
│   │   └── posts\              ← 每篇 WP 一个 md
│   ├── files\                  ← 工具字典页 + 可下载的 txt/py
│   └── assets\
│       ├── css\
│       │   ├── bg-video.css    ← 背景视频 + 卡片样式（★主要调这个）
│       │   └── blog-hover.css  ← 侧栏悬停浮层样式
│       ├── js\
│       │   ├── bg-video.js     ← 注入背景视频（带降级）
│       │   └── blog-hover.js   ← 悬停预览归档/分类下的文章
│       ├── video\              ← snowfall.mp4 + 封面图
│       └── images\             ← WP 用的截图（按题目分目录）
├── preview\                    ← 本机截图存档（已 gitignore）
└── site\                       ← 构建产物（已 gitignore，不要手改）
```

---

## 2. 环境（本机）

| 项 | 值 |
|---|---|
| 系统 | Windows 10 |
| Python | `C:\Python3\python.exe`（3.14.4） |
| mkdocs | 1.6.1 |
| mkdocs-material | 9.7.7 |
| Node | v24（本机有，但本项目不用） |
| git | 2.51，身份：`guang12-c` / `guang12-c@users.noreply.github.com` |
| ffmpeg | `C:\Python3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe`（由 `pip install imageio-ffmpeg` 带来，不是系统装的） |

**⚠️ pip 必须用清华镜像**，PyPI 直连会卡死（实测 15 分钟没响应）：

```powershell
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 3. 本地预览

```powershell
cd E:\dsh\ctf-notes
$env:SITE_URL = "http://127.0.0.1:8000/"
python -m mkdocs serve
```

**打开 http://127.0.0.1:8000/**

**⚠️ 那行 `SITE_URL` 不能省**，原因见第 8 节坑 1。

**改 md / CSS 会自动刷新；改 `mkdocs.yml` 会自动重启。**

---

## 4. 发布

### 自动（常规方式）

```powershell
cd E:\dsh\ctf-notes
git add .
git commit -m "描述这次改了什么"
git push
```

**push 后 GitHub Actions 自动跑（约 40 秒），再等 Pages 发布（约 30 秒）。**

**看进度：** https://github.com/guang12-c/ctf-notes/actions
**查状态（无需登录）：**

```powershell
Invoke-RestMethod 'https://api.github.com/repos/guang12-c/ctf-notes/actions/runs?per_page=3' |
  Select-Object -ExpandProperty workflow_runs |
  Select-Object name, status, conclusion
```

### 手动（备用）

```powershell
python -m mkdocs gh-deploy
```

**会直接构建并推到 `gh-pages` 分支。** 网络不好时这条也依赖 push。

### 线上验证

```powershell
# 页面是否 200
Invoke-WebRequest 'https://guang12-c.github.io/ctf-notes/' -UseBasicParsing -Method Head

# 新文章是否上线
Invoke-WebRequest 'https://guang12-c.github.io/ctf-notes/blog/<slug>/' -UseBasicParsing -Method Head
```

---

## 5. 写一篇 WP（最常做的事）

**1）新建文件：`docs\blog\posts\YYYY-MM-DD-英文短名.md`**

```markdown
---
date: 2026-10-24
slug: my-challenge-name
categories:
  - 命令注入
---

# [比赛名] 题目名

正文……
```

| 字段 | 说明 |
|---|---|
| `date` | 决定排序，也显示在列表里 |
| `slug` | **决定 URL**：`/blog/<slug>/`。**必须英文**，不写会用中文标题生成丑陋的编码 URL |
| `categories` | 可多个；会自动生成分类页 `/blog/category/<名字>/` |

**2）图片：** 放到 `docs\assets\images\<题目短名>\`，正文里引用：

```markdown
![说明](../../assets/images/<题目短名>/01-xxx.png)
```

**（从 `blog/posts/` 往上两级正好是 `docs/`，所以是 `../../assets/`）**

**3）不需要改 `mkdocs.yml`** —— blog 插件自动收集。

**4）正文风格（作者的习惯，务必遵守）：**

```text
题目 → 现象 → 判断 → 卡点 → 绕法 → 收获
```

- **尽量用作者自己的原话**，不要替他润色成"标准题解"
- **不要额外加分析章节**，他没要求的就不加
- 单题记录**简短**即可，别写成教程
- "踩的坑"统一格式：**现象 → 原因 → 正确做法**

---

## 6. 加一个知识点页面

**1）在对应目录建 md**，例如 `docs\knowledge\rce\新章节.md`

**2）⚠️ 必须登记到 `mkdocs.yml` 的 `nav`**，否则左侧目录里没有入口：

```yaml
nav:
  - 知识点:
      - RCE:
          - knowledge/rce/index.md
          - RCE 专题: knowledge/rce/RCE专题.md
          - 新章节: knowledge/rce/新章节.md      ← 加这行
```

**3）改完记得同步更新两个索引页：**

- `docs\knowledge\index.md` —— 顶部的方向汇总表
- `docs\index.md` —— 首页「知识点」卡片的一句话描述

---

## 7. 样式与交互（改外观）

### 7.1 背景视频 / 卡片透明度

**所有可调参数在 `docs\assets\css\bg-video.css` 开头的 `:root`：**

```css
:root {
  --bg-video-opacity: 0.62;                      /* 视频亮度 0~1 */
  --bg-overlay-top:    rgba(10, 16, 28, 0.28);   /* 遮罩上沿 */
  --bg-overlay-bottom: rgba(10, 16, 28, 0.58);   /* 遮罩下沿 */
  --card-bg-dark:  rgba(8, 12, 22, 0.46);        /* 深色卡片透明度 */
  --card-bg-light: rgba(255,255,255,0.70);       /* 浅色卡片透明度 */
  --card-blur: 0px;                              /* 0=背景清晰;12~24=毛玻璃 */
}
```

**作者的口味（重要）：**

- **背景要清晰**，不要毛玻璃糊成一片 → `--card-blur` 保持 `0px`
- **卡片要透**，能看见后面的树影和雪 → `--card-bg-dark` 在 `0.35~0.50`
- **文字必须可读** → 调低 alpha 时要确认正文对比度

**视频素材：** `docs\assets\video\snowfall.mp4`
（1280×720 / 12 秒 / 1.3 MB / 首尾交叉淡化做成无缝循环）

**重新生成（换素材时用）：**

```powershell
$ff = 'C:\Python3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'
$f = "[0:v]scale=1280:720:flags=lanczos,fps=24,split=3[a][b][c];" +
     "[a]trim=0:1.5,setpts=PTS-STARTPTS,format=yuva420p,fade=t=in:st=0:d=1.5:alpha=1[head];" +
     "[b]trim=12:13.5,setpts=PTS-STARTPTS,format=yuva420p,fade=t=out:st=0:d=1.5:alpha=1[tail];" +
     "[tail][head]overlay=format=auto,format=yuv420p[blend];" +
     "[c]trim=1.5:12,setpts=PTS-STARTPTS[body];" +
     "[blend][body]concat=n=2:v=1:a=0[out]"
& $ff -ss 8 -i 输入.mp4 -t 13.5 -filter_complex $f -map "[out]" `
   -c:v libx264 -crf 31 -preset slow -pix_fmt yuv420p -an -movflags +faststart `
   -y docs\assets\video\snowfall.mp4
```

**原理：** 取中间 13.5 秒，把尾部 1.5 秒和头部 1.5 秒交叉淡化，拼成 12 秒闭环 —— 播放到结尾接回开头时不会跳帧。

### 7.2 侧栏悬停预览

**`docs\assets\js\blog-hover.js` + `docs\assets\css\blog-hover.css`**

**功能：** 鼠标停在「归档 / 分类」下的链接（如「2026」「文件注入」）上，右侧浮出该类文章列表，点条目跳转。

**实现要点：**

```js
// 侧栏 href 是相对路径(archive/2026/),必须用 link.href(绝对)判断
function isBlogNavLink(a) {
  var h = a.href || '';
  return h.indexOf('/blog/archive/') >= 0 || h.indexOf('/blog/category/') >= 0;
}
```

- 悬停时 `fetch` 该归档/分类页 → 解析 `article.md-post` 里的 `h2 a.toclink`
- 结果按 URL 缓存，同一类只请求一次
- 标题超长：`text-overflow: ellipsis` + 右缘 `mask-image` 渐隐
- 触屏设备（`hover: none`）自动禁用

**改样式看 `blog-hover.css` 的 `.blog-hover-pop*` 系列。**

### 7.3 注册新的 CSS/JS

**必须在 `mkdocs.yml` 末尾登记：**

```yaml
extra_css:
  - assets/css/bg-video.css
  - assets/css/blog-hover.css

extra_javascript:
  - assets/js/bg-video.js
  - assets/js/blog-hover.js
```

---

## 8. 踩过的坑（接手前必看）

### 坑 1：`site_url` 带子路径 → 本地预览 404

**现象：** `mkdocs serve` 后访问 `/blog/` 报 404，只有 `/ctf-notes/blog/` 能开。

**原因：** `site_url` 是 `https://guang12-c.github.io/ctf-notes/`（带子路径），MkDocs 会把本地预览也挂到 `/ctf-notes/` 下。

**解决（已实施）：** `mkdocs.yml` 里用环境变量覆盖：

```yaml
site_url: !ENV [SITE_URL, "https://guang12-c.github.io/ctf-notes/"]
```

**本地起服务时必须带：**

```powershell
$env:SITE_URL = "http://127.0.0.1:8000/"
python -m mkdocs serve
```

**GitHub Actions 不带这个变量 → 用默认值 → 线上路径正常。**

### 坑 2：`Get-Process msedge | Stop-Process` 会杀掉作者的浏览器

**这是犯过的真实错误 —— 把作者正在用的 Edge 窗口全关了。**

**需要清理无头浏览器时，只能按 PID 或按命令行精确匹配：**

```powershell
$mine = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
        Where-Object { $_.CommandLine -match '_shotprof|_pp\d|_prof\d' }
$mine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**绝不要按进程名批量杀。**

### 坑 3：Edge 无头截图会往仓库里拉 120 个垃圾文件

**如果 `--user-data-dir` 指向项目目录（如 `_shotprof`），会被 `git add .` 一起提交。**

**解决：** 截图用的 profile 放项目外，或者 `.gitignore` 里排除（已排除 `_shotprof/`、`_pp*/`、`_prof*/`）。

**截完图顺手删掉 profile 目录。**

### 坑 4：PowerShell 里的 `curl` 不是 curl

**`curl` 是 `Invoke-WebRequest` 的别名，`-X` `-d` 都不认。**

```powershell
curl.exe -X POST -d "a=1" https://...    # 加 .exe 才是真 curl
```

**`wget` 同理。**

### 坑 5：GitHub 连接不稳定

**现象：** `Failed to connect to github.com port 443`。

**本机在中国大陆，GitHub 经常阶段性不通。**

**处理：** 提交在本地是安全的（`main` 会显示 `ahead 1`），隔几分钟重试即可：

```powershell
for ($i=1; $i -le 3; $i++) { git push; if ($?) { break }; Start-Sleep 10 }
```

### 坑 6：中文文件名 → URL 变成 `%E5%8E%9F%E7%90%86...`

**知识点区的中文文件名是有意保留的（和本地源文件对应）。**

**但 blog 的 `slug` 一定要英文**，否则 WP 链接会变成一长串百分号编码。

### 坑 7：`include` 的文章不会凭空出现在 nav 里

**新知识点页必须手动登记 `nav`**（见第 6 节），**blog 帖子则不需要**。

### 坑 8：改了 `site\` 目录没用

**`site\` 是构建产物，每次 `mkdocs build` 都会清空重建。所有修改都在 `docs\` 和 `mkdocs.yml`。**

---

## 9. 内容风格约定（延续作者习惯）

**作者是 CTF 学习者，笔记是他自己的理解，不是标准教程。**

**写 WP 时：**

| 要 | 不要 |
|---|---|
| 用他的原话 | 替他改写成"标准题解" |
| 保留"我当时怎么想的" | 补一堆他没做过的分析 |
| 短、直接 | 长篇大论 |
| 记"卡在哪、怎么绕过去" | 只记最后的 payload |

**格式模板：**

````markdown
**原话：**
> 他发来的原话

**payload：**
```text
...
```

**一句话：……**
````

**知识点文档的结构偏好：** 每章先给「判断依据」，再给「为什么有效」，最后才是 payload。

**已知的五个专题：** SQL 注入、文件上传、RCE、路径遍历、代码审计。
**下一步计划（作者提过）：** 文件包含（LFI）、反序列化、DVWA/CTFHub/BUUCTF 实战。

---

## 10. 常用命令速查

```powershell
# 进入项目
cd E:\dsh\ctf-notes

# 本地预览（必须带 SITE_URL）
$env:SITE_URL = "http://127.0.0.1:8000/"
python -m mkdocs serve

# 只构建
python -m mkdocs build

# 构建并检查警告（严格模式，有警告就失败）
python -m mkdocs build --strict

# 发布
git add . ; git commit -m "xxx" ; git push

# 手动发布
python -m mkdocs gh-deploy

# 看改动
git status --short ; git log --oneline -5

# 查 Actions 状态
Invoke-RestMethod 'https://api.github.com/repos/guang12-c/ctf-notes/actions/runs?per_page=3' |
  Select-Object -ExpandProperty workflow_runs | Select-Object name, status, conclusion
```

---

## 11. 交接检查清单

**新会话接手时，按顺序确认：**

```
□ 读本文件(docs 结构、约定、坑)
□ cd E:\dsh\ctf-notes && git status        → 有没有未提交的改动
□ git log --oneline -5                      → 最近做了什么
□ 本地起 preview 看一眼                     → 站点是否正常
□ 确认线上 200                              → 有没有部署失败
```

**然后就可以开始干活了。**

---

## 12. 变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-22 | 站点搭建(MkDocs Material)、搬入 SQL/上传/RCE/审计四本手册、6 篇 WP、字典区 |
| 2026-10-22 | 接入 GitHub Pages、配自动部署工作流 |
| 2026-10-22 | 背景视频(雪林 12s 无缝循环)、毛玻璃卡片、暗色/亮色适配 |
| 2026-10-23 | 新增路径遍历专题(六关全通) + ZJCTF NiZhuanSiWei WP(含图) |
| 2026-10-23 | 博客侧栏悬停预览、`site_url` 环境变量覆盖修复本地预览 |

---

**这份手册如果和代码不一致，以代码为准，并顺手更新这里。**
