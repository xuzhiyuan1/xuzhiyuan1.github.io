/* opalite/gate.js — 可复用密码门卫。
   任何 /opalite/* 子页面在 <head> 顶部引入:
       <script src="/opalite/gate.js"></script>
   未授权设备会被一个全屏口令层挡住;授权后(同一 localStorage 令牌+后端白名单)
   移除口令层并派发 window 事件 "opalite:ready"。页面应在该事件里再拉取/渲染私密数据。
   暴露:window.opaliteDevice(设备ID)、window.opaliteFetch(path,opts)(GET 自动带 device)。
   注意:GitHub 上的静态源码是公开的,子页面里不要塞机密,真正的私密数据必须从后端拉。 */
(function () {
  var BACKEND = "https://opalite.xuzhiyuan1.top";
  var LS = "opalite_device";
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  var device = localStorage.getItem(LS);
  if (!device) { device = uid(); localStorage.setItem(LS, device); }
  window.opaliteDevice = device;

  window.opaliteFetch = function (path, opts) {
    opts = opts || {};
    var url = BACKEND + path;
    if ((opts.method || "GET").toUpperCase() === "GET") {
      url += (path.indexOf("?") >= 0 ? "&" : "?") + "device=" + encodeURIComponent(device);
    }
    return fetch(url, opts).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  };

  var css = document.createElement("style");
  css.textContent =
    "#opaliteGate{position:fixed;inset:0;z-index:99999;background:#0e1016;color:#e7e9ee;display:flex;" +
    "flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;text-align:center;" +
    "font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif}" +
    "#opaliteGate .lk{width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,#7c9cff,#a78bfa);" +
    "display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:16px}" +
    "#opaliteGate h2{margin:0 0 4px;font-size:20px}#opaliteGate p{margin:0 0 18px;color:#8b93a3;font-size:13px;max-width:320px}" +
    "#opaliteGate input{width:100%;max-width:300px;background:#1e222c;border:1px solid #2a2f3a;color:#e7e9ee;" +
    "border-radius:12px;padding:12px 14px;font:inherit;outline:none;margin:6px 0}" +
    "#opaliteGate input:focus{border-color:#7c9cff}" +
    "#opaliteGate button{width:100%;max-width:300px;background:#7c9cff;color:#0b0e16;border:none;border-radius:12px;" +
    "padding:12px;font-weight:600;font-size:15px;cursor:pointer;margin-top:8px}" +
    "#opaliteGate button:disabled{opacity:.55}" +
    "#opaliteGate .ge{color:#ff6b6b;font-size:13px;min-height:18px;margin-top:8px}" +
    "#opaliteGate .gh{color:#8b93a3;font-size:12px;margin-top:12px}";
  (document.head || document.documentElement).appendChild(css);

  var ov = document.createElement("div");
  ov.id = "opaliteGate";
  ov.innerHTML =
    '<div class="lk">🔒</div><h2>Opalite</h2>' +
    '<p>私密页面。首次进入需输入口令授权本设备,之后本设备免密。</p>' +
    '<div id="ogForm" style="display:none;width:100%;max-width:300px">' +
    '<input id="ogPw" type="password" placeholder="口令" autocomplete="off">' +
    '<input id="ogLabel" type="text" placeholder="给本设备起个名(可选)" autocomplete="off">' +
    '<button id="ogBtn">进入</button><div class="ge" id="ogErr"></div></div>' +
    '<div class="gh" id="ogHint">正在验证本设备…</div>';
  function mount() {
    document.body.appendChild(ov);
    var form = ov.querySelector("#ogForm"), hint = ov.querySelector("#ogHint");
    var pw = ov.querySelector("#ogPw"), lab = ov.querySelector("#ogLabel");
    var btn = ov.querySelector("#ogBtn"), err = ov.querySelector("#ogErr");
    function ready() {
      css.remove(); ov.remove();
      try { window.dispatchEvent(new CustomEvent("opalite:ready", { detail: { device: device } })); } catch (e) {
        var ev = document.createEvent("CustomEvent"); ev.initCustomEvent("opalite:ready", false, false, { device: device });
        window.dispatchEvent(ev);
      }
    }
    function showForm(msg) { hint.style.display = "none"; form.style.display = "block"; if (msg) { err.textContent = msg; } pw.focus(); }
    function submit() {
      err.textContent = ""; btn.disabled = true; btn.textContent = "验证中…";
      fetch(BACKEND + "/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: device, pass: pw.value, label: lab.value.trim() }) })
        .then(function (r) { return r.json().then(function (j) { j.__s = r.status; return j; }); })
        .then(function (j) {
          btn.disabled = false; btn.textContent = "进入";
          if (j && j.ok) { ready(); } else { err.textContent = (j && j.__s === 401) ? "口令不对" : "进入失败,请重试"; }
        })
        .catch(function () { btn.disabled = false; btn.textContent = "进入"; err.textContent = "连不上服务器"; });
    }
    btn.addEventListener("click", submit);
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    lab.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    // 探活 + 查授权
    fetch(BACKEND + "/ping").then(function (r) { return r.json(); }).then(function (p) {
      if (!p || !p.ok) { hint.textContent = "服务器暂时连不上,稍后再试"; return; }
      window.opaliteFetch("/whoami").then(function (w) {
        if (w && w.authorized) { ready(); } else { showForm(""); }
      }).catch(function () { showForm(""); });
    }).catch(function () { hint.textContent = "服务器暂时连不上,稍后再试"; });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
