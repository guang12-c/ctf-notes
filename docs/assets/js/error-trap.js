/**
 * 诊断模式错误捕捉器（只在 URL 带 ?diag=1 时生效）
 *
 * 为什么需要它：手机端搜索“能打字但没结果”，而桌面两种内核都正常，
 * 说明是设备侧的 JS 出错。但 iPhone 上看不到控制台，于是把错误直接画到页面上。
 *
 * 只用 URL 参数开启，正常访问时这段代码立即返回，不影响任何访客。
 */
(function () {
  if (!/[?&]diag=1\b/.test(location.search)) return;

  var shown = 0;
  var MAX = 6;

  function show(title, detail) {
    if (shown >= MAX) return;
    shown++;

    var box = document.createElement('div');
    box.setAttribute('data-diag-error', '');
    box.style.cssText = [
      'position:fixed', 'left:8px', 'right:8px', 'top:8px', 'z-index:2147483647',
      'background:#7d1a1a', 'color:#fff', 'padding:10px 34px 10px 12px',
      'border-radius:8px', 'font:12px/1.5 ui-monospace,Consolas,monospace',
      'box-shadow:0 4px 18px rgba(0,0,0,.5)', 'white-space:pre-wrap',
      'word-break:break-all', 'max-height:60vh', 'overflow:auto'
    ].join(';');

    var t = document.createElement('div');
    t.style.cssText = 'font-weight:700;margin-bottom:4px;font-family:-apple-system,sans-serif';
    t.textContent = '⚠ ' + title;

    var d = document.createElement('div');
    d.textContent = detail;

    var x = document.createElement('div');
    x.textContent = '×';
    x.style.cssText = 'position:absolute;right:10px;top:6px;font-size:18px;cursor:pointer';
    x.onclick = function () { box.remove(); };

    box.appendChild(t);
    box.appendChild(d);
    box.appendChild(x);
    document.body.appendChild(box);

    // 也塞进 title，方便复制
    document.title = '⚠ ' + (document.title.indexOf('⚠') === 0 ? document.title.slice(2) : document.title);
  }

  // ---- 普通脚本错误 ----
  window.addEventListener('error', function (e) {
    // 资源加载失败（img/script）不会带 message
    if (e.target && e.target !== window && e.target.tagName) {
      show('资源加载失败', e.target.tagName + ' → ' + (e.target.src || e.target.href || ''));
      return;
    }
    show('脚本错误',
      (e.message || '(无 message)') +
      '\n' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?') +
      (e.error && e.error.stack ? '\n\n' + String(e.error.stack).slice(0, 500) : ''));
  }, true);

  // ---- 未处理的 Promise ----
  window.addEventListener('unhandledrejection', function (e) {
    show('未处理的 Promise 拒绝', String(e.reason && e.reason.stack ? e.reason.stack : e.reason).slice(0, 500));
  });

  // ---- 拦截 Worker 的创建，抓 worker 内部错误 ----
  // Material 的搜索在用户第一次打开搜索时才创建 worker，
  // 所以这里替换构造函数是来得及的。
  try {
    var OrigWorker = window.Worker;
    if (typeof OrigWorker === 'function') {
      var Patched = function (url, opts) {
        var w = opts ? new OrigWorker(url, opts) : new OrigWorker(url);
        try {
          w.addEventListener('error', function (ev) {
            show('Worker 运行错误',
              'url: ' + url +
              '\nmessage: ' + (ev.message || '(空)') +
              '\nfile: ' + (ev.filename || '?') + ':' + (ev.lineno || '?') +
              (ev.error && ev.error.stack ? '\n\n' + String(ev.error.stack).slice(0, 400) : ''));
          });
          w.addEventListener('messageerror', function () {
            show('Worker 消息反序列化失败', 'url: ' + url);
          });
        } catch (x) {}
        return w;
      };
      Patched.prototype = OrigWorker.prototype;
      window.Worker = Patched;
    }
  } catch (e) {}

  // ---- console.error 也顺手抓一下 ----
  try {
    var origErr = console.error;
    console.error = function () {
      try {
        show('console.error', Array.prototype.slice.call(arguments).map(function (a) {
          return typeof a === 'string' ? a : (a && a.message) || String(a);
        }).join(' ').slice(0, 500));
      } catch (x) {}
      return origErr.apply(console, arguments);
    };
  } catch (e) {}

  // ---- 一个可见的标记，确认脚本确实加载了 ----
  var badge = document.createElement('div');
  badge.textContent = '诊断模式已启用';
  badge.style.cssText = [
    'position:fixed', 'right:8px', 'bottom:8px', 'z-index:2147483646',
    'background:#1f6feb', 'color:#fff', 'padding:6px 10px', 'border-radius:999px',
    'font:11px/1 -apple-system,sans-serif', 'opacity:.9'
  ].join(';');
  badge.onclick = function () { badge.remove(); };
  document.body.appendChild(badge);
})();
