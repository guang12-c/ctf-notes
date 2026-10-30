<section class="hero" data-reveal>
  <p class="hero__eyebrow">Web 安全 · 靶场记录</p>
  <h1 class="hero__title">把每一次卡壳，<br>变成下一次的判断</h1>
  <p class="hero__sub">SQL 注入、文件上传、RCE、SSRF、反序列化按主题整理成手册；每道靶场题记下现象、判断依据和最后的绕法，而不只是答案。</p>
  <a class="hero__cta" href="knowledge/">从知识点开始 <span aria-hidden="true">→</span></a>
  <p class="hero__proof">17 篇知识点 · 28 篇 WP · 最近更新 2026-10-30</p>
</section>

<div class="index-list" data-reveal>

<a class="index-row" href="knowledge/">
  <span class="index-row__no">01</span>
  <span class="index-row__body">
    <span class="index-row__title">知识点</span>
    <span class="index-row__desc">按主题归类的手册：SQL 注入、文件上传、RCE、路径遍历、文件包含、SSRF、反序列化、代码审计，外加工具命令速查。</span>
  </span>
  <span class="index-row__arrow" aria-hidden="true">→</span>
</a>

<a class="index-row" href="blog/">
  <span class="index-row__no">02</span>
  <span class="index-row__body">
    <span class="index-row__title">WP 博客</span>
    <span class="index-row__desc">靶场通关记录，按时间倒序。重点写卡在哪、当时怎么想的、最后靠什么绕过去。</span>
  </span>
  <span class="index-row__arrow" aria-hidden="true">→</span>
</a>

<a class="index-row" href="files/">
  <span class="index-row__no">03</span>
  <span class="index-row__body">
    <span class="index-row__title">工具字典</span>
    <span class="index-row__desc">SQLi 与命令注入的 fuzz 字典，直接喂给 Burp Intruder 或 ffuf 就能跑。</span>
  </span>
  <span class="index-row__arrow" aria-hidden="true">→</span>
</a>

</div>

<section class="tagline" data-reveal>
  <p data-words>目标不是攒 payload，而是攒判断力。知道为什么有效，比知道这么打更值钱。</p>
</section>

## 学习路线

```text
SQL 注入 ──┐
文件上传 ──┼──> Web 漏洞基础
命令注入 ──┤
代码执行 ──┘
     │
     └──> 代码审计（把点串成面）
```

## 记录原则

| 记什么 | 怎么记 |
|---|---|
| **知识点** | 按主题归类，只写「判断依据」和「为什么有效」 |
| **WP** | 按时间倒序，重点写**卡在哪、怎么想到的** |
| **踩的坑** | 每条坑都写「现象 → 原因 → 正确做法」 |
