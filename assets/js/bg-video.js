/* ===========================================
   背景视频注入
   - 桌面和手机都加载（手机竖屏也生效）
   - 省流模式 / 减少动效 → 不加载
   - 移动端适配：内联播放（微信/QQ X5 内核、iOS Safari）
   - 自动播放被拦 → 首次触摸时补播
   =========================================== */
(function () {
  "use strict";

  // 1) 省流 / 减少动效 → 不加载
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return;

  // 2) 用脚本自身位置推算资源根目录
  //    脚本在 <site>/assets/js/bg-video.js → 资源根 <site>/assets/
  var self = document.currentScript;
  var assets = self
    ? new URL("../", self.src)
    : new URL("assets/", location.href);

  // 3) 构建背景容器
  var wrap = document.createElement("div");
  wrap.className = "ctf-bg";
  wrap.setAttribute("aria-hidden", "true");

  var video = document.createElement("video");
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  // 关键：移动端要"内联播放"，否则会被系统播放器接管或干脆不渲染
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x5-playsinline", "");          // 微信/QQ X5 内核
  video.setAttribute("x5-video-player-type", "h5");  // X5 用 H5 播放器
  video.setAttribute("x5-video-player-fullscreen", "false");
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload");
  video.poster = new URL("video/snowfall-poster.jpg", assets).href;
  video.src = new URL("video/snowfall.mp4", assets).href;

  wrap.appendChild(video);

  /* ---------- 播放控制 ---------- */

  var started = false;

  function tryPlay() {
    if (started) return;
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        started = true;
      }).catch(function () {
        // 被拦（iOS 低电量 / 部分 WebView）→ 等用户第一次触摸再试
        armGestureFallback();
      });
    } else {
      started = !video.paused;
    }
  }

  // 用户第一次触摸/点击时补播（这是浏览器允许的"用户手势"）
  function armGestureFallback() {
    if (armGestureFallback.done) return;
    armGestureFallback.done = true;
    var handler = function () {
      var p = video.play();
      if (p && typeof p.then === "function") {
        p.then(function () { started = true; }).catch(function () {});
      }
      document.removeEventListener("touchstart", handler, true);
      document.removeEventListener("click", handler, true);
      document.removeEventListener("scroll", handler, true);
    };
    document.addEventListener("touchstart", handler, true);
    document.addEventListener("click", handler, true);
    document.addEventListener("scroll", handler, true);
  }

  // 数据够了再播，避免还没解码就 play 失败
  video.addEventListener("loadeddata", tryPlay, { once: true });
  video.addEventListener("canplay", tryPlay, { once: true });

  function mount() {
    if (document.querySelector(".ctf-bg")) return;
    // 挂到 <html> 而不是 <body>：避开 body 上任何可能存在的 transform，
    // 保证 position: fixed 真正相对视口（手机上尤其重要）
    var host = document.documentElement;
    host.insertBefore(wrap, host.firstChild);
    tryPlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
