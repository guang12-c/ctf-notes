# XSS 关卡复现页

配合 [XSS 专题](../../knowledge/xss/XSS专题.md) 使用。

| 页面 | 演示什么 |
|---|---|
| [level4_repro.html](level4_repro.html) | `location.href = jumpUrl` 就是洞：倒计时拆成 3 秒，另附 `escape()` 实时对比、失败写法对照 |
| [level5_repro.html](level5_repro.html) | 表单提交 = 一次导航：三条 action 路径对比 + 自检（用 `window.__hit` 判断到底执行没执行） |
| [level6_repro.html](level6_repro.html) | AngularJS 1.4.6 模板注入：`{{7*7}}` → 49，五种 payload 一键切换 |

**这三页都是可以点、可以改输入框的。**改完刷新就能看到结果，不需要装环境。

!!! note "level6 需要联网"

    它从 `cdn.staticfile.org` 拉 AngularJS 1.4.6（和原题同一个地址）。
    断网时页面不会生效 —— 那是 CDN 没拉到，不是 payload 错了。

!!! tip "复现页的用法"

    先在这里把"哪一行是洞"看清楚，再回原题打。
    原题的干扰（倒计时、自动提交、模板编译）会让人把"没反应"误判成"被过滤了"。
