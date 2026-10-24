/* ===========================================
   背景层注入
   两种模式：
     桌面 → <video> 播雪林循环视频
     手机 → 静态图 + CSS 飘雪（iOS 上视频不可靠，静止又难看）
   自动播放/兼容性都不再依赖 video 在移动端工作
   =========================================== */
(function () {
  "use strict";

  // 1) 省流 / 减少动效 → 什么都不放（CSS 已有纯色兜底）
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  // 省流模式才彻底不加载；"减弱动态效果"仍然保留静态图（CSS 会把动画关掉），
  // 否则 iOS 开了这个选项的用户会看到一片纯色，像是背景坏了
  if (saveData) return;

  // 2) 资源根目录（脚本在 <site>/assets/js/bg-video.js）
  var self = document.currentScript;
  var assets = self
    ? new URL("../", self.src)
    : new URL("assets/", location.href);

  var posterUrl = new URL("video/snowfall-poster.jpg", assets).href;
  var videoUrl = new URL("video/snowfall.mp4", assets).href;

  // 3) 判断是否用静态模式
  //    触屏设备（iPhone/iPad/Android）一律静态：
  //    iOS 上自动播放 + position:fixed + 滚动 = 三个坑叠一起，不值得赌
  var isTouch =
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  var isNarrow = window.matchMedia("(max-width: 76.1875em)").matches;
  var useStill = isTouch || isNarrow || reduce;

  // 4) 容器
  var wrap = document.createElement("div");
  wrap.className = "ctf-bg";
  wrap.setAttribute("aria-hidden", "true");

  function mount(node) {
    if (document.querySelector(".ctf-bg")) return;
    // 挂在 <body> 第一个位置：可见性靠 CSS 的 z-index 分层解决，
    // 不用负 z-index（iOS Safari 上会把整层画到画布后面，导致完全看不见）
    document.body.insertBefore(node || wrap, document.body.firstChild);
  }

  /* ================= 静态模式：图 + 飘雪 ================= */

  if (useStill) {
    wrap.setAttribute("data-mode", "still");
    wrap.style.setProperty("--bg-still", "url('" + posterUrl + "')");

    var still = document.createElement("div");
    still.className = "ctf-still";
    // 直接内联图片地址，不依赖 CSS 变量（少一个失败点）
    still.style.backgroundImage = "url('" + posterUrl + "')";

    var snow = document.createElement("div");
    snow.className = "ctf-snow";

    wrap.appendChild(still);
    wrap.appendChild(snow);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { mount(wrap); }, { once: true });
    } else {
      mount(wrap);
    }
    return;
  }

  /* ================= 桌面模式：视频 ================= */

  var video = document.createElement("video");
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("x5-playsinline", "");
  video.setAttribute("x5-video-player-type", "h5");
  video.setAttribute("disablepictureinpicture", "");
  video.poster = posterUrl;
  video.src = videoUrl;

  wrap.appendChild(video);
  wrap.setAttribute("data-mode", "video");

  var started = false;
  function tryPlay() {
    if (started) return;
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.then(function () { started = true; }).catch(function () {
        // 被拦 → 等用户第一次交互再补播
        if (tryPlay.armed) return;
        tryPlay.armed = true;
        var h = function () {
          var q = video.play();
          if (q && q.then) q.then(function () { started = true; }).catch(function () {});
          ["touchstart", "click", "scroll"].forEach(function (e) {
            document.removeEventListener(e, h, true);
          });
        };
        ["touchstart", "click", "scroll"].forEach(function (e) {
          document.addEventListener(e, h, true);
        });
      });
    } else {
      started = !video.paused;
    }
  }

  video.addEventListener("loadeddata", tryPlay, { once: true });
  video.addEventListener("canplay", tryPlay, { once: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mount(wrap); tryPlay(); }, { once: true });
  } else {
    mount(wrap);
    tryPlay();
  }
})();
