# guang's CTF Notes

Web 安全知识点 + 靶场 WP 的个人站点，基于 **MkDocs Material**。

## 本地预览

```powershell
cd E:\dsh\ctf-notes
python -m mkdocs serve
# 打开 http://127.0.0.1:8000/
```

改了 md 会自动刷新（`--dirtyreload` 更快）。

## 调整背景效果

所有可调参数都在 **`docs/assets/css/bg-video.css` 开头**：

```css
:root {
  --bg-video-opacity: 0.62;      /* 视频亮度：0~1，越大越亮 */
  --bg-overlay-top:    rgba(10, 16, 28, 0.28);   /* 遮罩上沿 */
  --bg-overlay-bottom: rgba(10, 16, 28, 0.58);   /* 遮罩下沿 */
  --card-bg-dark:  rgba(8, 12, 22, 0.46);        /* 深色卡片透明度 */
  --card-bg-light: rgba(255,255,255,0.70);       /* 浅色卡片透明度 */
  --card-blur: 0px;              /* 0 = 背景清晰可见；调大 = 毛玻璃 */
}
```

| 想要的效果 | 怎么改 |
|---|---|
| 背景更明显 | `--card-bg-dark` 的最后一个数调小（0.46 → 0.30） |
| 背景更亮 | `--bg-video-opacity` 调大（0.62 → 0.8），或遮罩 alpha 调小 |
| 想要毛玻璃感 | `--card-blur` 调到 `12px` ~ `24px` |
| 文字更好读 | 卡片 alpha 调大，或加一点 `--card-blur` |
| 干脆不要视频 | 删掉 `mkdocs.yml` 里的 `extra_javascript` |

**当前是「清晰」档：`--card-blur: 0px`，背景视频原样透出来，只靠一层暗色 tint 压暗。**

**视频素材**：`docs/assets/video/snowfall.mp4`（1280×720 / 12 秒 / 1.3 MB，首尾交叉淡化做成的无缝循环）

**换视频**：用 ffmpeg 按同样参数输出覆盖即可，JS 不用改。

## 背景视频的降级策略

| 情况 | 行为 |
|---|---|
| 窗口 < 768px（约手机宽度） | 不显示视频 |
| 系统开了「减少动效」 | 不显示视频 |
| 浏览器省流模式 | JS 不加载视频 |
| 自动播放被拦 | 保留封面图 `snowfall-poster.jpg` |

## 构建

```powershell
python -m mkdocs build
# 产物在 site\ 目录（纯静态，5 MB 左右）
```

## 目录结构

```text
ctf-notes\
├── mkdocs.yml              ← 配置（导航、主题、插件）
├── docs\
│   ├── index.md            ← 首页
│   ├── knowledge\          ← 知识点（左侧树形目录）
│   │   ├── sql\
│   │   ├── upload\
│   │   ├── rce\
│   │   ├── web\
│   │   └── audit\
│   ├── blog\               ← WP 博客（按时间倒序）
│   │   ├── index.md
│   │   └── posts\
│   ├── files\              ← 可下载的字典
│   └── assets\
└── site\                   ← 构建产物（不进 git）
```

## 写一篇新 WP

1. 在 `docs\blog\posts\` 新建 `YYYY-MM-DD-英文短名.md`
2. 开头写 front matter：

```yaml
---
date: 2026-10-23
slug: my-new-wp
categories:
  - 命令注入
---
```

3. 正文按固定结构写：

```text
题目 → 现象 → 判断 → 卡点 → 绕法 → 收获
```

4. 在 `mkdocs.yml` 的 `nav` 里**不需要**登记 —— blog 插件自动收集
5. 刷新预览即可看到

> `slug` 建议用英文，决定最终 URL：`/blog/<slug>/`
> 不写 `slug` 会用中文标题生成 URL（能用，但难看）

## 加一个知识点页面

1. 在对应目录新建 `.md`
2. **必须**在 `mkdocs.yml` 的 `nav` 里加一行，否则不会出现在左侧目录

```yaml
nav:
  - 知识点:
      - RCE:
          - 新章节: knowledge/rce/新章节.md
```

## 部署到 GitHub Pages

```powershell
# 首次：先在 GitHub 建仓库，然后
git init
git remote add origin https://github.com/<用户名>/<仓库名>.git

# 每次发布
python -m mkdocs gh-deploy
```

`gh-deploy` 做的事：构建 → 推到 `gh-pages` 分支 → Pages 自动发布。

上线前把 `mkdocs.yml` 里的 `site_url` 填上：

```yaml
site_url: "https://<用户名>.github.io/<仓库名>/"
```

## 常用命令速查

| 目的 | 命令 |
|---|---|
| 本地预览 | `python -m mkdocs serve` |
| 构建 | `python -m mkdocs build` |
| 发布 | `python -m mkdocs gh-deploy` |
| 严格检查（有警告就失败） | `python -m mkdocs build --strict` |

## 依赖

```powershell
pip install -r requirements.txt
# 国内网络慢就加镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```
