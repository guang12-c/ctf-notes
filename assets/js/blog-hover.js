/* ===========================================
   博客侧栏悬停预览
   - 鼠标停在「归档 / 分类」下的链接上
   - 右上浮出该类下的文章列表
   - 点条目直接跳转
   - 结果按 href 缓存，只请求一次
   =========================================== */
(function () {
  "use strict";

  // 触屏设备不做
  if (window.matchMedia("(hover: none)").matches) return;

  // 注意:侧栏里的 href 是相对路径(archive/2026/),
  // 所以必须用 link.href(绝对 URL)判断,不能用 [href*=] 属性选择器
  function isBlogNavLink(a) {
    var h = a.href || '';
    return h.indexOf('/blog/archive/') >= 0 || h.indexOf('/blog/category/') >= 0;
  }

  var cache = Object.create(null);
  var pop = null;
  var hideTimer = null;
  var showTimer = null;
  var activeLink = null;

  /* ---------- 浮层 ---------- */

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "blog-hover-pop";
    pop.setAttribute("role", "tooltip");
    pop.addEventListener("mouseenter", cancelHide);
    pop.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(pop);
    return pop;
  }

  function cancelHide() {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(function () {
      if (pop) pop.classList.remove("is-open");
      activeLink = null;
    }, 160);
  }

  function position(link) {
    var r = link.getBoundingClientRect();
    var pr = pop.getBoundingClientRect();
    var gap = 10;
    var left = r.right + gap;
    var top = r.top - 4;

    // 右边放不下 → 放左边
    if (left + pr.width > window.innerWidth - 12) {
      left = Math.max(12, r.left - pr.width - gap);
    }
    // 底部溢出 → 上移
    if (top + pr.height > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - 12 - pr.height);
    }

    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  /* ---------- 抓文章列表 ---------- */

  function extractPosts(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var items = [];
    doc.querySelectorAll("article.md-post").forEach(function (art) {
      var a = art.querySelector("h2 a.toclink") || art.querySelector("h2 a");
      if (!a) return;
      var t = a.textContent.trim();
      if (!t) return;
      var time = art.querySelector("time");
      var raw = time ? (time.getAttribute("datetime") || time.textContent.trim()) : "";
      items.push({
        href: a.getAttribute("href"),
        title: t,
        date: raw ? raw.slice(0, 10) : ""   // 只留 YYYY-MM-DD
      });
    });
    return items;
  }

  function load(href) {
    if (cache[href]) return Promise.resolve(cache[href]);
    return fetch(href, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        var items = html ? extractPosts(html) : [];
        cache[href] = items;
        return items;
      })
      .catch(function () { return []; });
  }

  /* ---------- 渲染 ---------- */

  function render(link, href, items) {
    var label = (link.textContent || "").trim();
    var frag = document.createDocumentFragment();

    var head = document.createElement("div");
    head.className = "blog-hover-pop__head";
    head.textContent = label + (items.length ? " · " + items.length + " 篇" : "");
    frag.appendChild(head);

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "blog-hover-pop__item";
      empty.style.opacity = "0.5";
      empty.textContent = "暂无文章";
      frag.appendChild(empty);
    } else {
      items.forEach(function (it) {
        var a = document.createElement("a");
        a.className = "blog-hover-pop__item";
        a.href = new URL(it.href, href).href;

        var t = document.createElement("span");
        t.className = "blog-hover-pop__t";
        t.textContent = it.title;
        t.title = it.title; // 原生提示兜底,截断也看得到全名

        var d = document.createElement("span");
        d.className = "blog-hover-pop__d";
        d.textContent = it.date;

        a.appendChild(t);
        if (it.date) a.appendChild(d);
        frag.appendChild(a);
      });
    }

    var more = document.createElement("a");
    more.className = "blog-hover-pop__more";
    more.href = href;
    more.textContent = "查看全部 →";
    frag.appendChild(more);

    pop.innerHTML = "";
    pop.appendChild(frag);
  }

  /* ---------- 交互 ---------- */

  function show(link) {
    var href = link.href;
    if (!href) return;
    activeLink = link;

    var p = ensurePop();
    render(link, href, []); // 先显示“加载中”的空壳
    p.querySelector(".blog-hover-pop__head").textContent =
      (link.textContent || "").trim() + " · 加载中…";
    p.classList.add("is-open");
    position(link);

    load(href).then(function (items) {
      if (activeLink !== link) return;
      render(link, href, items);
      position(link);
    });
  }

  function bind(link) {
    link.addEventListener("mouseenter", function () {
      cancelHide();
      showTimer = setTimeout(function () { show(link); }, 120);
    });
    link.addEventListener("mouseleave", scheduleHide);
    link.addEventListener("focus", function () { show(link); });
    link.addEventListener("blur", scheduleHide);
  }

  function init() {
    document.querySelectorAll('.md-nav__link[href]').forEach(function (a) {
      if (isBlogNavLink(a)) bind(a);
    });
    // 滚动或缩放时收起,避免浮层错位
    window.addEventListener("scroll", scheduleHide, { passive: true });
    window.addEventListener("resize", scheduleHide);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
