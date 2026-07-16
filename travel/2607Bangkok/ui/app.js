/* 曼谷之旅 · 全部逻辑（index.html 与 itinerary.html 共用）。
   数据优先实时读后端（CONFIG.BACKEND_URL，秒级更新），后端不可达时兜底读本仓库
   data/site.json / trip.json / guide.json / users.json（每天备份一次的静态副本）。
   本文件负责加载与渲染，等价复现原 data.js + 两页内联脚本的可见输出。 */
(function(){
  "use strict";

  /* ============================================================
     CONFIG（后端固定域名，走 Cloudflare Tunnel）
     ============================================================ */
  var CONFIG = {
    BACKEND_URL: "https://trip.xuzhiyuan1.top",
    BACKEND_TIMEOUT_MS: 5000 // 后端请求超时：超时/失败一律回退到仓库静态 JSON，保证不白屏
  };

  var DATA, SITE, GUIDE, USERS, ITINERARY, TRANSPORT, OVERVIEW, DUR;
  var MAP_DEFAULT = "Bangkok Thailand";
  var pageRender = null; /* 当前页面的"用最新 DATA 重新渲染"函数：index=renderAll，itin=render */
  var activateTab = null; /* index 页专属：切 tab 函数（由 initIndex 内的 showTab 赋值），供小王子对话框
                              "共享攻略本"按钮跨作用域调用；itinerary 页没有 tab 结构，此值保持 null，
                              对话框那边会退化成跳转到 index.html#guide */

  /* ---------- 公共小工具（原 data.js） ---------- */
  function enc(q){ return String(q).replace(/ /g, "+"); }
  function mapA(q){ return ' <a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + enc(q) + '">🧭 导航</a>'; }
  function stripTags(s){ return s.replace(/<[^>]*>/g, "").trim(); }
  function pad(n){ return String(n).padStart(2, "0"); }
  function todayKey(){ var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /* 北京时间格式化（"MM-DD HH:mm"）：后端记录的修改时间自带 +08:00 偏移，
     用 Intl.DateTimeFormat 强制以 Asia/Shanghai 时区取字段，不管看的人手机在什么时区，
     显示的都是北京时间（等价于 toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',...})）。
     供"修改记录"列表 与 顶部下拉刷新条"最新改动"时间共用。 */
  var BJ_FMT = ("Intl" in window) ? new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }) : null;
  function fmtBJ(d){
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    if (!BJ_FMT) return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    var o = {};
    BJ_FMT.formatToParts(d).forEach(function(p){ o[p.type] = p.value; });
    var hh = (o.hour === "24") ? "00" : o.hour; // 少数环境 hour12:false 可能给 "24" 表示午夜
    return o.month + "-" + o.day + " " + hh + ":" + o.minute;
  }

  /* 倒计时文案（带秒，近的更精确） */
  function cdText(ms){
    if (ms <= 0) return "进行中";
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); var sec = s % 60;
    var dPart = d > 0 ? '<span class="cdD">' + d + 'd</span> ' : '';
    return dPart + '<span class="cdC">' + pad(h) + ":" + pad(m) + ":" + pad(sec) + '</span>';
  }

  /* 逐日行程 item 的正文（title 里的 {durian} 换成榴莲图标，每个 place 追加导航按钮） */
  function renderItemBody(it){
    var s = String(it.title || "").split("{durian}").join(DUR);
    (it.places || []).forEach(function(p){ s += mapA(p); });
    return s;
  }

  /* 合并"当前未完成的公共行程" + 所选角色的往返航班，按时间排序 */
  function buildUpcoming(roleName){
    var now = Date.now();
    var all = [];
    ITINERARY.forEach(function(day){
      day.items.forEach(function(it){
        if (new Date(it.iso).getTime() > now) all.push({ t: it.iso, label: stripTags(renderItemBody(it)) });
      });
    });
    if (roleName && roleName !== OVERVIEW){
      var p = TRANSPORT[roleName];
      if (p && p.segments){
        p.segments.forEach(function(seg){
          all.push({ t: seg.t, label: seg.label + " " + seg.no + " 起飞" });
        });
      }
    }
    return all.filter(function(e){ return new Date(e.t).getTime() > now; })
              .sort(function(a, b){ return new Date(a.t) - new Date(b.t); });
  }

  /* 攻略列表：runs（文字/加粗/链接段）+ 可选地图点 */
  function runsHTML(runs){
    return (runs || []).map(function(r){
      if (r.href) return '<a target="_blank" rel="noopener" href="' + r.href + '">' + r.t + '</a>';
      if (r.b != null) return '<b>' + r.b + '</b>';
      return r.t;
    }).join("");
  }
  function guideLi(item){
    return '<li>' + runsHTML(item.runs) + (item.place ? mapA(item.place) : "") + '</li>';
  }

  /* ---------- 数据加载：优先读后端实时接口，超时/失败兜底读仓库静态 JSON ---------- */

  /* 带超时的 fetch：用 AbortController，超过 ms 毫秒直接判定失败（不无限等） */
  function fetchWithTimeout(url, ms, opts){
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms) : null;
    var o = opts || {};
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function(r){ clearTimeout(timer); return r; }, function(err){ clearTimeout(timer); throw err; });
  }

  /* 主路径：GET {BACKEND_URL}/data 一次性返回整个 bundle {site,trip,guide,users} */
  function loadFromBackend(){
    return fetchWithTimeout(CONFIG.BACKEND_URL + "/data", CONFIG.BACKEND_TIMEOUT_MS).then(function(r){
      if (!r.ok) throw new Error("后端 /data HTTP " + r.status);
      return r.json();
    }).then(function(bundle){
      if (!bundle || !bundle.site || !bundle.trip || !bundle.guide || !bundle.users){
        throw new Error("后端 /data 返回结构不完整");
      }
      return bundle;
    });
  }

  /* 兜底路径：分别 fetch 本仓库 data/*.json（带时间戳防缓存），拼成同样结构的 bundle */
  function loadFromRepo(){
    var qs = "?t=" + Date.now();
    return Promise.all([
      fetch("data/site.json" + qs).then(function(r){ return r.json(); }),
      fetch("data/trip.json" + qs).then(function(r){ return r.json(); }),
      fetch("data/guide.json" + qs).then(function(r){ return r.json(); }),
      fetch("data/users.json" + qs).then(function(r){ return r.json(); })
    ]).then(function(res){
      return { site: res[0], trip: res[1], guide: res[2], users: res[3] };
    });
  }

  function load(){
    return loadFromBackend().catch(function(err){
      console.warn("后端 /data 不可达，回退到仓库静态 JSON（最近一次备份）：", err);
      return loadFromRepo();
    }).then(function(bundle){
      DATA = bundle;
      SITE = DATA.site; GUIDE = DATA.guide; USERS = DATA.users;
      ITINERARY = DATA.trip.itinerary; TRANSPORT = DATA.trip.transport;
      OVERVIEW = USERS.overviewLabel;
      DUR = '<img class="dur" src="ui/' + SITE.themeImage + '" alt="榴莲">';
      return DATA;
    });
  }

  /* 后台轮询：重新拉取 data/*.json 并调用当前页面已有的渲染函数（不新建渲染逻辑，不重复计时器） */
  function refreshData(){
    return load().then(function(){
      if (typeof pageRender === "function") pageRender();
    }).catch(function(err){ console.error("刷新数据失败", err); });
  }
  function startDataPolling(){
    setInterval(refreshData, 30000);
  }

  /* ---------- 修改记录：优先读后端 {BACKEND_URL}/history（实时），超时/失败兜底读仓库
     data/history.json（同仓库相对路径，带时间戳防缓存；可能 404/为空）。
     供"小王子·修改记录"面板 与 "下拉刷新指示条"（显示最新改动时间）共用，避免重复实现 ---------- */
  function loadHistoryFromRepo(){
    return fetch("data/history.json?t=" + Date.now()).then(function(r){
      if (!r.ok) return [];
      return r.json().catch(function(){ return []; });
    }).then(function(data){
      var arr = Array.isArray(data) ? data : ((data && (data.items || data.history || data.records)) || []);
      if (!Array.isArray(arr)) arr = [];
      return arr;
    }).catch(function(){ return []; });
  }
  function loadHistory(){
    return fetchWithTimeout(CONFIG.BACKEND_URL + "/history", CONFIG.BACKEND_TIMEOUT_MS).then(function(r){
      if (!r.ok) throw new Error("后端 /history HTTP " + r.status);
      return r.json();
    }).then(function(data){
      if (!data || !Array.isArray(data.history)) throw new Error("后端 /history 返回结构不对");
      return data.history;
    }).catch(function(err){
      console.warn("后端 /history 不可达，回退到仓库 data/history.json（最近一次备份）：", err);
      return loadHistoryFromRepo();
    }).then(function(arr){
      return arr.slice().reverse(); // 最新的在前
    });
  }

  /* ============================================================
     交通样式库：每种交通方式一款样式（本次曼谷之旅用「机票」款）。
     以后加 train/car 各加一款：TRANSPORT_STYLES.train = ..., TRANSPORT_STYLES.car = ...
     flight(seg, mine) 产出的 HTML 与原航班卡片（原 fcard）逐字节一致：
       label 取 seg.label（去程/返程），其余字段由原 leg.xxx 换成 seg.xxx。
     ============================================================ */
  var TRANSPORT_STYLES = {
    flight: function(seg, mine){
      var lab = '<div class="flabel">' + seg.label + '</div>';
      if (!seg) return lab + '<div class="fcard"><div class="fmeta">航班待补充</div></div>';
      var meta = seg.meta + (seg.price ? ' · ' + seg.price : '');
      return lab + '<div class="fcard' + (mine ? ' mine' : '') + '">' +
        '<div class="frow2"><span class="no">' + seg.air + ' ' + seg.no + '</span><span class="fdur">✈ ' + seg.dur + '</span></div>' +
        '<div class="fmeta">' + meta + '</div>' +
        '<div class="froute">' +
          '<div class="fend"><div class="fcity">' + seg.depCity + '</div><div class="ftime" data-bj="' + seg.depBJ + '" data-th="' + seg.depTH + '">' + seg.depBJ + '</div></div>' +
          '<div class="farrow">→</div>' +
          '<div class="fend r"><div class="fcity">' + seg.arrCity + '</div><div class="ftime" data-bj="' + seg.arrBJ + '" data-th="' + seg.arrTH + '">' + seg.arrBJ + '</div></div>' +
        '</div>' +
        '</div>';
    }
  };

  /* ============================================================ index ============================================================ */
  function initIndex(){
    var $ = function(id){ return document.getElementById(id); };

    /* 固定文案填充 */
    $("brandTitle").textContent = SITE.brandTitle;
    $("heroDates").textContent = SITE.dates;
    $("heroTag").innerHTML = String(SITE.heroTag).split("{durian}").join(DUR);
    $("nowWx").textContent = SITE.weatherBrief;

    /* 攻略：榴莲大作战 + 实用提醒 */
    $("durianList").innerHTML = GUIDE.durianTips.map(guideLi).join("");
    $("tipsList").innerHTML = GUIDE.practicalTips.map(guideLi).join("");

    /* ====== 下拉 Tab（日程 / 机酒 / 攻略本） ====== */
    var tabToggle = $("tabToggle");
    var tabMenu = $("tabMenu");
    var TAB_LABELS = { plan: "日程", jz: "机酒", guide: "攻略本" };
    var TAB_PANES = { plan: "panePlan", jz: "paneJz", guide: "paneGuide" };
    tabToggle.addEventListener("click", function(e){
      e.stopPropagation();
      var open = tabMenu.hidden;
      tabMenu.hidden = !open;
      tabToggle.classList.toggle("open", open);
    });
    document.addEventListener("click", function(e){
      if (!tabMenu.hidden && !tabMenu.contains(e.target) && e.target !== tabToggle){ tabMenu.hidden = true; tabToggle.classList.remove("open"); }
    });
    /* 切 tab：按 tab 名显示对应 pane、同步下拉高亮态与折叠按钮文案。挂到模块级 activateTab，
       供小王子对话框"共享攻略本"按钮直接调用（不用等下拉菜单里的按钮被点） */
    function showTab(tab){
      if (!TAB_LABELS[tab]) return;
      Object.keys(TAB_PANES).forEach(function(t){
        var el = $(TAB_PANES[t]);
        if (el) el.hidden = (t !== tab);
      });
      Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(b){ b.classList.toggle("active", b.dataset.tab === tab); });
      tabToggle.innerHTML = TAB_LABELS[tab] + ' <span class="car">▾</span>';
      tabMenu.hidden = true; tabToggle.classList.remove("open");
    }
    Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(btn){
      btn.addEventListener("click", function(){ showTab(btn.dataset.tab); });
    });
    activateTab = showTab;
    /* 从 itinerary 页点"共享攻略本"会跳到 index.html#guide；这里接住这个 hash，直接打开攻略本 tab，
       然后把 hash 清掉（history.replaceState），避免刷新/分享链接时又重复触发 */
    if (location.hash === "#guide"){
      showTab("guide");
      if (window.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    }

    /* ====== 角色选择 ====== */
    var whoSel = $("who");
    USERS.roles.concat([OVERVIEW]).forEach(function(n){ whoSel.add(new Option(n, n)); });
    var saved = localStorage.getItem("who");
    whoSel.value = (saved && (TRANSPORT[saved] || saved === OVERVIEW)) ? saved : USERS.defaultRole;

    /* ====== 时区切换（默认北京时间，机酒 tab 用） ====== */
    var tz = localStorage.getItem("tz") || "bj";
    function applyTz(){
      var els = document.querySelectorAll(".ftime");
      for (var i = 0; i < els.length; i++){ els[i].textContent = (tz === "bj" ? els[i].dataset.bj : els[i].dataset.th); }
      $("tzbtn").textContent = (tz === "bj" ? SITE.timezones.bj.label : SITE.timezones.th.label);
    }
    $("tzbtn").addEventListener("click", function(){
      tz = (tz === "bj" ? "th" : "bj"); localStorage.setItem("tz", tz); applyTz();
    });

    /* ====== 交通卡（每段用交通样式库对应款渲染；本次全为机票款） ====== */
    function segHTML(seg, mine){
      return (TRANSPORT_STYLES[seg.type || "flight"] || TRANSPORT_STYLES.flight)(seg, mine);
    }
    function renderFlights(){
      var box = $("flightBox");
      if (whoSel.value === OVERVIEW){
        box.innerHTML = USERS.roles.map(function(n){
          var p = TRANSPORT[n];
          return '<div class="pname">' + n + '</div>' + (p.segments || []).map(function(seg){ return segHTML(seg, false); }).join("");
        }).join("");
      } else {
        var p = TRANSPORT[whoSel.value];
        box.innerHTML = (p.segments || []).map(function(seg){ return segHTML(seg, true); }).join("") + (p.note ? '<div class="note">' + p.note + '</div>' : '');
      }
      applyTz();
    }

    /* ====== 酒店卡 ====== */
    function hotelRowHTML(r){
      var b = "";
      if (r.name){ b += '<b>' + r.name + '</b>'; if (r.sub) b += '<br>' + r.sub; }
      else if (r.text){ b += r.text; }
      if (r.place) b += mapA(r.place);
      if (r.note) b += '<div class="n">' + r.note + '</div>';
      return '<div class="item"><div class="t">' + r.icon + '</div><div class="b">' + b + '</div></div>';
    }
    $("hotelBox").innerHTML = DATA.trip.hotel.rows.map(hotelRowHTML).join("");

    /* ====== 攻略本（DATA.guidebook：大家跟小王子聊天时自动攒的攻略/问答，最新在上） ====== */
    function guideCardHTML(item){
      item = item || {};
      var author = item.author ? escapeHtml(item.author) : "";
      var d = item.at ? new Date(item.at) : null;
      var timeLabel = (d && !isNaN(d.getTime())) ? fmtBJ(d) : "";
      var metaHTML = (author || timeLabel)
        ? '<div class="guideMeta">' + (author ? '<b>' + author + '</b>' : '<span></span>') + (timeLabel ? '<span>' + timeLabel + '</span>' : '') + '</div>'
        : "";
      if (item.type === "qa"){
        return '<div class="card guideCard guideQa">' +
          '<div class="guideQ"><span class="guideTag q">问</span><span>' + escapeHtml(item.q || "") + '</span></div>' +
          '<div class="guideA"><span class="guideTag a">答</span><span>' + escapeHtml(item.a || "") + '</span></div>' +
          metaHTML + '</div>';
      }
      /* 默认按 tip（攻略）渲染：q 是攻略要点（标题），a 是小王子整理的细节 */
      return '<div class="card guideCard guideTip">' +
        '<div class="guideTitle">📝 ' + escapeHtml(item.q || "") + '</div>' +
        (item.a ? '<div class="guideDetail">' + escapeHtml(item.a) + '</div>' : "") +
        metaHTML + '</div>';
    }
    function renderGuidebook(){
      var box = $("guideCards");
      if (!box) return;
      var list = (DATA.guidebook || []).slice().sort(function(a, b){
        return new Date((b && b.at) || 0).getTime() - new Date((a && a.at) || 0).getTime(); // 最新在上
      });
      if (!list.length){
        box.innerHTML = '<div class="card guideEmpty">还没有攻略哦～点右下小王子，跟它分享一条攻略或问个问题吧🍈</div>';
        return;
      }
      box.innerHTML = list.map(guideCardHTML).join("");
    }

    /* ====== 地图卡（按"今天"动态定位/生成内容） ====== */
    function mapCardHTML(loc, title){
      var locs = (loc && loc.length) ? loc : [MAP_DEFAULT];
      var list = locs.map(function(l){ return '<li>' + l + mapA(l) + '</li>'; }).join("");
      return '<div class="card"><details><summary>🗺️ ' + title + '</summary>' +
        '<iframe class="gmap" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=' + enc(locs[0]) + '&z=12&output=embed"></iframe>' +
        '<ul class="tips" style="margin-top:8px">' + list + '</ul></details></div>';
    }
    function allTripLinkHTML(){
      return '<a href="itinerary.html" class="card allLink"><h2 style="margin-bottom:2px">📋 全部行程</h2><div class="note">点开查看完整行程，当前时段自动高亮 →</div></a>';
    }

    /* ====== 逐日行程渲染（只显示未完成的；地图按今天插入；末尾"全部行程"） ====== */
    function renderSchedule(){
      var now = Date.now();
      var key = todayKey();
      var firstDate = ITINERARY[0].date, lastDate = ITINERARY[ITINERARY.length - 1].date;
      var matchIdx = ITINERARY.findIndex(function(d){ return d.date === key; });
      var beforeTrip = key < firstDate;
      var afterTrip = key > lastDate;
      var html = "";

      ITINERARY.forEach(function(day, idx){
        var future = day.items.filter(function(it){ return new Date(it.iso).getTime() > now; });
        if (future.length){
          var itemsHtml = future.map(function(it){
            return '<div class="item"><div class="t">' + it.time + '</div><div class="b">' + renderItemBody(it) + (it.note ? '<div class="n">' + it.note + '</div>' : '') + '</div></div>';
          }).join("");
          var todayCls = (day.date === key) ? ' today' : '';
          html += '<div class="card day' + todayCls + '" data-date="' + day.date + '"><h2>' + day.title + '</h2>' + itemsHtml + '</div>';
        }
        if (beforeTrip && idx === 0){
          html += mapCardHTML([], "出发前 · 曼谷全览");
        } else if (!beforeTrip && !afterTrip && idx === matchIdx){
          html += mapCardHTML(day.loc, day.label + " 游览地图");
        }
      });
      if (afterTrip){
        var allLoc = [].concat.apply([], ITINERARY.map(function(d){ return d.loc || []; }));
        html += mapCardHTML(allLoc, "全部游览地点");
      }
      html += allTripLinkHTML();
      $("dayCards").innerHTML = html;
    }

    /* ====== 此刻关注：下一件事 + 大倒计时；下下件事 + 天气 ====== */
    function renderNow(){
      function clip(s){ return s.length > 15 ? s.slice(0, 15) + "…" : s; }
      var evs = buildUpcoming(whoSel.value);
      var next = evs[0], after = evs[1];
      var labEl = $("nowNextLabel");
      var cdEl = $("nowCd");
      var afEl = $("nowAfter");
      if (next){
        labEl.textContent = next.label;
        cdEl.innerHTML = cdText(new Date(next.t).getTime() - Date.now());
      } else {
        var ended = Date.now() > new Date(SITE.tripEnd).getTime();
        labEl.textContent = ended ? "旅途结束，欢迎回家 🏠" : "暂无更多安排";
        cdEl.innerHTML = "";
      }
      afEl.textContent = after ? "Next：" + clip(after.label) : "";
    }

    function renderAll(){
      $("defRole").textContent = whoSel.value;
      renderFlights();
      renderSchedule();
      renderNow();
      renderGuidebook();
    }
    whoSel.addEventListener("change", function(){ localStorage.setItem("who", whoSel.value); renderAll(); });
    renderAll();
    pageRender = renderAll; /* 供 30s 数据轮询复用，不再额外加 60s 定时器 */
    setInterval(renderNow, 1000);        // 倒计时每秒更新

    /* ====== 设备编号（不展示访问历史） ====== */
    var devId = localStorage.getItem("deviceId");
    if (!devId){ devId = "D-" + Math.random().toString(36).slice(2, 8).toUpperCase(); localStorage.setItem("deviceId", devId); }
    $("devId").textContent = devId;
  }

  /* ============================================================ itinerary ============================================================ */
  function initItin(){
    function render(){
      var now = Date.now();
      var key = todayKey();
      var currentId = null;
      for (var di = 0; di < ITINERARY.length && currentId === null; di++){
        for (var ii = 0; ii < ITINERARY[di].items.length; ii++){
          if (new Date(ITINERARY[di].items[ii].iso).getTime() > now){ currentId = di + "-" + ii; break; }
        }
      }
      var html = ITINERARY.map(function(day, di){
        var isToday = day.date === key;
        var items = day.items.map(function(it, ii){
          var id = di + "-" + ii;
          var done = new Date(it.iso).getTime() <= now;
          var cls = done ? "done" : (id === currentId ? "current" : "future");
          var tag = (id === currentId) ? '<span class="nowtag">现在</span>' : '';
          return '<div class="item ' + cls + '"><div class="t"><span class="dot ' + cls + '"></span>' + it.time + '</div>' +
            '<div class="b">' + renderItemBody(it) + tag + (it.note ? '<div class="n">' + it.note + '</div>' : '') + '</div></div>';
        }).join("");
        return '<div class="card' + (isToday ? " today" : "") + '"><h2>' + day.title + (isToday ? '<span class="tag">今天</span>' : '') + '</h2>' + items + '</div>';
      }).join("");
      document.getElementById("days").innerHTML = html;
    }
    render();
    pageRender = render; /* 供 30s 数据轮询复用，不再额外加 30s 定时器 */
  }

  /* ---------- 转义（历史记录/文案里可能是用户自由输入，插入 innerHTML 前需转义） ---------- */
  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 悬浮小助手（小王子）：偶尔冒气泡邀请 + 点击弹出"改行程"对话框 + 修改记录 ---------- */
  function initPrinceFab(){
    var fab = document.getElementById("princeFab");
    if (!fab) return;

    var BUBBLE_MESSAGES = [
      "行程/攻略有要改的？点我告诉小王子～",
      "想调时间、加地点？点我一句话就行～",
      "发现哪儿写错了？点我改～"
    ];
    var DRAFT_KEY = "princeDraft"; // 对话框输入框草稿：随打随存，关闭再打开还在，提交成功/手动清空才清除
    var modalOpen = false;
    var overlayEl = null;
    var bubbleEl = null;
    var bubbleHideTimer = null;
    var bubbleTimer = null;
    var msgIdx = 0;
    var pollTimer = null;   // 对话区轮询定时器：仅对话框开着时存在，关闭对话框即清掉
    var pollAuthor = null;  // 当前轮询对应的角色，防止切换角色/关闭后旧轮询结果串进新对话区

    function randBetween(a, b){ return a + Math.random() * (b - a); }

    /* ===== 气泡 ===== */
    function ensureBubble(){
      if (bubbleEl) return bubbleEl;
      bubbleEl = document.createElement("div");
      bubbleEl.className = "princeBubble";
      bubbleEl.innerHTML = '<span class="princeBubbleText"></span><button type="button" class="princeBubbleClose" aria-label="关闭">×</button>';
      document.body.appendChild(bubbleEl);
      bubbleEl.querySelector(".princeBubbleText").addEventListener("click", function(){
        hideBubble();
        openModal();
      });
      bubbleEl.querySelector(".princeBubbleClose").addEventListener("click", function(e){
        e.stopPropagation();
        hideBubble();
      });
      return bubbleEl;
    }
    function showBubble(){
      if (modalOpen) return;
      var el = ensureBubble();
      el.querySelector(".princeBubbleText").textContent = BUBBLE_MESSAGES[msgIdx % BUBBLE_MESSAGES.length];
      msgIdx++;
      el.classList.add("show");
      clearTimeout(bubbleHideTimer);
      bubbleHideTimer = setTimeout(function(){ el.classList.remove("show"); }, 6000);
    }
    function hideBubble(){
      if (bubbleEl) bubbleEl.classList.remove("show");
      clearTimeout(bubbleHideTimer);
    }
    function scheduleNextBubble(delay){
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function(){
        if (!modalOpen) showBubble();
        scheduleNextBubble(randBetween(4 * 60000, 6 * 60000)); // 之后每 4~6 分钟一次
      }, delay);
    }

    /* ===== 对话框 ===== */
    function buildModal(){
      var overlay = document.createElement("div");
      overlay.className = "princeOverlay";
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="princeTail" aria-hidden="true"></div>' +
        '<div class="princeModal" role="dialog" aria-modal="true" aria-label="小王子·改行程">' +
          '<div class="princeHd">👑 小王子</div>' +
          '<select class="princeRoleSel" id="princeRoleSel" aria-label="选择角色"></select>' +
          '<div class="princeSub">告诉我你想怎么改行程/攻略，我来帮你改～</div>' +
          '<div class="princeChat" id="princeChat" hidden></div>' +
          '<textarea class="princeTextarea" id="princeText" rows="2" placeholder="想改什么？例：把8月1日大皇宫改到11点"></textarea>' +
          '<button type="button" class="princeSubmit" id="princeSubmit">提交给小王子</button>' +
          '<div class="princeStatus" id="princeStatus"></div>' +
          '<div class="princeDivider"></div>' +
          '<div class="princeFooterRow">' +
            '<button type="button" class="princeHistoryBtn" id="princeHistoryBtn">📜 查看修改记录</button>' +
            '<button type="button" class="princeShareBtn" id="princeShareBtn">📖 共享攻略本</button>' +
          '</div>' +
          '<div class="princeHistory" id="princeHistory" hidden></div>' +
        '</div>';
      document.body.appendChild(overlay);

      /* 没有×关闭按钮：点遮罩（对话框以外区域）关闭；点对话框内部（角色下拉/输入框/按钮/历史列表）不关。
         再点一次小王子（princeFab）也能关闭——那部分逻辑在 fab 的 click 监听器里做成开关切换。 */
      overlay.addEventListener("click", function(e){ if (e.target === overlay) closeModal(); });

      var textEl = overlay.querySelector("#princeText");
      var submitBtn = overlay.querySelector("#princeSubmit");
      var statusEl = overlay.querySelector("#princeStatus");
      var historyBtn = overlay.querySelector("#princeHistoryBtn");
      var historyEl = overlay.querySelector("#princeHistory");
      var roleSel = overlay.querySelector("#princeRoleSel");
      var shareBtn = overlay.querySelector("#princeShareBtn");

      /* 草稿：文本框内容随打随存到 localStorage，关闭对话框再打开、甚至刷新页面后都还在；
         提交成功后清空（用户手动清空文本框时 input 事件也会把草稿一起清掉）。 */
      textEl.value = localStorage.getItem(DRAFT_KEY) || "";
      textEl.addEventListener("input", function(){ localStorage.setItem(DRAFT_KEY, textEl.value); });

      /* 角色下拉：选项与右上角整体角色选择器 #who 完全一致；在这里改 → 把 #who.value 设成新值并
         触发它的 change，让页面原有逻辑（存 localStorage('who') + renderAll）照常跑一遍，整页角色
         （机酒/此刻关注等）跟着变。itinerary 页没有 #who，就直接写 localStorage('who')。
         默认值/与 #who 保持最新一致，由 openModal() 里的 syncRoleSel() 在每次打开时同步。 */
      (USERS.roles.concat([OVERVIEW])).forEach(function(n){ roleSel.add(new Option(n, n)); });
      roleSel.addEventListener("change", function(){
        var whoEl = document.getElementById("who");
        if (whoEl){
          whoEl.value = roleSel.value;
          whoEl.dispatchEvent(new Event("change"));
        } else {
          localStorage.setItem("who", roleSel.value);
        }
        loadChatForRole(roleSel.value);
      });

      submitBtn.addEventListener("click", function(){
        var text = textEl.value.trim();
        if (!text){
          statusEl.className = "princeStatus err";
          statusEl.textContent = "先写点想改的内容再提交哦～";
          return;
        }
        /* 作者取对话框角色下拉的当前值（与 #who 保持同步一致） */
        var author = roleSel.value || "";
        if (!author || author === OVERVIEW){
          statusEl.className = "princeStatus err";
          statusEl.textContent = "请先在右上角选一下你是谁~";
          return;
        }
        submitBtn.disabled = true;
        statusEl.className = "princeStatus loading";
        statusEl.textContent = "发送中…";
        /* 发完就走：POST /edit 立即返回（几十毫秒），拿到成功响应就算发送成功，
           不等后台真正改完。马上把这轮对话（用户说的话 + "正在改…"）画进对话区，
           清空输入框，然后转入轮询等结果，全程不阻塞、可以直接关页面。 */
        postEdit(author, text).then(function(res){
          submitBtn.disabled = false;
          if (res.ok && res.data && res.data.ok){
            statusEl.className = "princeStatus ok";
            statusEl.textContent = "已发送，小王子在后台改，可以关掉页面啦～";
            renderChatArea({ text: text, reply: "", status: "处理中", at: new Date().toISOString() });
            textEl.value = "";
            localStorage.removeItem(DRAFT_KEY);
            startPoll(author);
          } else {
            var errMsg = (res.data && res.data.error) ? res.data.error : ("提交失败（状态码 " + res.status + "）");
            statusEl.className = "princeStatus err";
            statusEl.textContent = "没发送成功：" + errMsg;
          }
        }).catch(function(err){
          submitBtn.disabled = false;
          statusEl.className = "princeStatus err";
          if (err && err.name === "AbortError"){
            statusEl.textContent = "发送超时了，检查一下网络再试试～";
          } else {
            statusEl.textContent = "网络好像断了，检查一下再试试～";
          }
        });
      });

      historyBtn.addEventListener("click", function(){
        if (!historyEl.hidden){
          historyEl.hidden = true;
          historyBtn.textContent = "📜 查看修改记录";
          return;
        }
        historyEl.hidden = false;
        historyBtn.textContent = "📜 收起修改记录";
        historyEl.innerHTML = '<div class="princeHistLoading">加载中…</div>';
        loadHistory().then(function(list){
          if (!list.length){
            historyEl.innerHTML = '<div class="princeHistEmpty">还没有人改过～</div>';
            return;
          }
          /* 只展示最近 20 条，放进可滚动容器（.princeHistory 自带 max-height+overflow-y:auto），
             列表再长也不会把对话框撑长，用滚轮/触摸即可翻看 */
          var shown = list.slice(0, 20);
          var note = list.length > 20 ? '<div class="princeHistNote">仅显示最近 20 条（共 ' + list.length + ' 条）</div>' : '';
          historyEl.innerHTML = note + shown.map(historyItemHTML).join("");
        }).catch(function(){
          historyEl.innerHTML = '<div class="princeHistEmpty">修改记录加载失败，待会儿再看看～</div>';
        });
      });

      /* 「共享攻略本」：关闭对话框 + 切到攻略本 tab。index 页有 activateTab（initIndex 里赋值的
         showTab），直接调用即可；itinerary 页没有 tab 结构，退化成跳转到 index.html#guide，
         index 页加载时会认出这个 hash 并直接打开攻略本 tab（见 initIndex 里的 hash 处理）。 */
      shareBtn.addEventListener("click", function(){
        closeModal();
        if (typeof activateTab === "function"){
          activateTab("guide");
        } else {
          location.href = "index.html#guide";
        }
      });

      return overlay;
    }

    /* 手机端键盘弹起时，把 overlay 的 top/height 同步到 visualViewport（浏览器可见区域），
       这样锚定在右下角的对话框会跟着可见区域收缩，输入框和提交按钮始终留在视口内、不被键盘挡住。 */
    var vvSyncHandler = null;
    function syncOverlayToViewport(){
      if (!overlayEl || !window.visualViewport) return;
      var vv = window.visualViewport;
      overlayEl.style.top = vv.offsetTop + "px";
      overlayEl.style.height = vv.height + "px";
    }
    /* 每次打开对话框时，把角色下拉同步成"当前整体角色"：优先读 #who.value，
       没有 #who 的页面（itinerary）读 localStorage('who')，保证外部若改过角色，下次打开能反映最新值。 */
    function syncRoleSel(){
      if (!overlayEl) return;
      var roleSel = overlayEl.querySelector("#princeRoleSel");
      if (!roleSel) return;
      var whoEl = document.getElementById("who");
      var cur = whoEl ? whoEl.value : (localStorage.getItem("who") || "");
      if (cur) roleSel.value = cur;
    }
    function openModal(){
      if (!overlayEl) overlayEl = buildModal();
      syncRoleSel();
      var statusEl = overlayEl.querySelector("#princeStatus");
      statusEl.className = "princeStatus";
      statusEl.textContent = "";
      overlayEl.hidden = false;
      modalOpen = true;
      fab.classList.add("princeFabActive"); // 小王子保持/加强高亮，呼应"正在对话"
      if (window.visualViewport){
        syncOverlayToViewport();
        vvSyncHandler = syncOverlayToViewport;
        window.visualViewport.addEventListener("resize", vvSyncHandler);
        window.visualViewport.addEventListener("scroll", vvSyncHandler);
      }
      requestAnimationFrame(function(){ overlayEl.classList.add("show"); });
      /* 每次打开都拉一下"当前角色最后一次对话"填进对话区：关掉再打开、或切到别的角色都能看到
         各自最新的一轮（发的话 + 小王子回复/进度），不依赖前端是否还留着轮询 */
      var roleSel = overlayEl.querySelector("#princeRoleSel");
      loadChatForRole(roleSel ? roleSel.value : "");
    }
    function closeModal(){
      if (!overlayEl) return;
      overlayEl.classList.remove("show");
      modalOpen = false;
      fab.classList.remove("princeFabActive");
      stopPoll(); // 对话框关了就不再轮询，省流量；下次打开 loadChatForRole 会重新拉最新状态
      if (window.visualViewport && vvSyncHandler){
        window.visualViewport.removeEventListener("resize", vvSyncHandler);
        window.visualViewport.removeEventListener("scroll", vvSyncHandler);
        vvSyncHandler = null;
      }
      setTimeout(function(){
        if (!modalOpen){
          overlayEl.hidden = true;
          overlayEl.style.top = ""; overlayEl.style.height = "";
        }
      }, 200);
    }

    /* ===== 提交修改：POST {BACKEND_URL}/edit —— 后端立即返回（几十毫秒）{ok:true,status:"处理中"}，
       真正的改动在后端异步跑，前端不必等，拿到这个响应就算"发送成功" ===== */
    function postEdit(author, text){
      return fetchWithTimeout(CONFIG.BACKEND_URL + "/edit", CONFIG.BACKEND_TIMEOUT_MS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author, text: text })
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(data){
          return { status: r.status, ok: r.ok, data: data };
        });
      });
    }

    /* ===== 对话区：GET {BACKEND_URL}/exchange?author=<角色> 拿该角色最后一次对话
       { text, reply, status, at }，status ∈ 处理中/完成/失败；无记录时返回 {} ===== */
    function fetchExchange(author){
      return fetchWithTimeout(CONFIG.BACKEND_URL + "/exchange?author=" + encodeURIComponent(author), CONFIG.BACKEND_TIMEOUT_MS)
        .then(function(r){
          if (!r.ok) throw new Error("后端 /exchange HTTP " + r.status);
          return r.json();
        });
    }

    /* 把一轮对话（ex = {text, reply, status, at}）画进对话区：用户气泡靠右，小王子气泡靠左；
       处理中＝"正在改…"+小圆点动画，完成＝显示 reply，失败＝显示 reply（错误说明）+ 醒目配色 */
    function renderChatArea(ex){
      if (!overlayEl) return;
      var chatEl = overlayEl.querySelector("#princeChat");
      if (!chatEl) return;
      if (!ex || !ex.text){
        chatEl.hidden = false;
        chatEl.innerHTML = '<div class="princeChatEmpty">还没有对话记录，写点什么发给小王子试试吧～</div>';
        return;
      }
      var status = ex.status || "完成";
      var princeCls = "princeChatBubble prince";
      var princeContent;
      if (status === "处理中"){
        princeCls += " loading";
        princeContent = '小王子正在改<span class="princeDots"><span></span><span></span><span></span></span>';
      } else if (status === "失败"){
        princeCls += " err";
        princeContent = escapeHtml(ex.reply || "没改成功，要不再试一次？");
      } else {
        princeContent = escapeHtml(ex.reply || "");
      }
      var timeLabel = "";
      if (ex.at){ var d = new Date(ex.at); if (!isNaN(d.getTime())) timeLabel = fmtBJ(d); }
      chatEl.hidden = false;
      chatEl.innerHTML =
        '<div class="princeChatBubble user">' + escapeHtml(ex.text) + '</div>' +
        '<div class="' + princeCls + '">' + princeContent + '</div>' +
        (timeLabel ? '<div class="princeChatTime">' + timeLabel + '</div>' : '');
    }

    /* 轮询管理：仅对话框开着时才跑（closeModal 会 stopPoll），每 3 秒查一次，
       状态变"完成"/"失败"就把气泡更新到位并停止；"完成"顺便 refreshData() 让页面数据跟着刷新 */
    function stopPoll(){
      if (pollTimer){ clearInterval(pollTimer); pollTimer = null; }
      pollAuthor = null;
    }
    function startPoll(author){
      stopPoll();
      pollAuthor = author;
      pollTimer = setInterval(function(){
        fetchExchange(author).then(function(ex){
          if (pollAuthor !== author) return; // 期间已切换角色/关闭对话框，丢弃这次结果
          renderChatArea(ex);
          if (ex && (ex.status === "完成" || ex.status === "失败")){
            stopPoll();
            if (ex.status === "完成") refreshData();
          }
        }).catch(function(){ /* 单次轮询失败静默忽略，下一轮再试，不打断用户 */ });
      }, 3000);
    }

    /* 打开对话框 / 切换角色下拉时调用：拉该角色最后一次对话填进对话区；
       如果拉到的状态仍是"处理中"（比如提交后关了对话框、之后又打开），顺带恢复轮询 */
    function loadChatForRole(author){
      if (!overlayEl) return;
      var chatEl = overlayEl.querySelector("#princeChat");
      if (!chatEl) return;
      if (!author || author === OVERVIEW){
        stopPoll();
        chatEl.hidden = true;
        chatEl.innerHTML = "";
        return;
      }
      stopPoll();
      fetchExchange(author).then(function(ex){
        renderChatArea(ex);
        if (ex && ex.status === "处理中") startPoll(author);
      }).catch(function(){
        chatEl.hidden = false;
        chatEl.innerHTML = '<div class="princeChatEmpty">对话记录加载失败，待会儿再看看～</div>';
      });
    }

    /* 修改记录列表的单条渲染（loadHistory() 已上移到模块作用域，供本面板与下拉刷新指示条共用） */
    function historyItemHTML(e){
      e = e || {};
      var author = e.author || e.name || e.user || e.who || "匿名";
      var text = e.text || e.content || e.summary || e.change || e.desc || "";
      var timeRaw = e.time || e.at || e.ts || e.date || e.created || "";
      var timeLabel = timeRaw;
      var d = timeRaw ? new Date(timeRaw) : null;
      if (d && !isNaN(d.getTime())) timeLabel = fmtBJ(d); // 统一按北京时间显示，不管看的人手机在什么时区
      return '<div class="princeHistItem"><div class="princeHistMeta"><b>' + escapeHtml(author) + '</b><span>' +
        escapeHtml(String(timeLabel)) + '</span></div><div class="princeHistText">' + escapeHtml(String(text)) + '</div></div>';
    }

    /* 点小王子＝开关切换：没开就打开，开着就关闭（配合去掉×号后的新关闭方式） */
    fab.addEventListener("click", function(){ if (modalOpen) closeModal(); else openModal(); });
    scheduleNextBubble(40000); // 加载后约 40 秒冒第一个气泡
  }

  /* ---------- 下拉刷新（顶部指示条）：移动端手指下拉 + 桌面端鼠标下拉/点击均可，两页共用。
     指示条 DOM 是 index.html / itinerary.html 里已有的 #pullBanner（本函数只接线交互逻辑），
     刷新动作直接复用现有 refreshData()，不新建轮询/定时器；时间来源复用 loadHistory()。 ---------- */
  function initPullRefresh(){
    var banner = document.getElementById("pullBanner");
    var spacer = document.getElementById("pullSpacer");
    var row = document.getElementById("pullRow");
    if (!banner || !spacer || !row) return;
    var iconEl = document.getElementById("pullIcon");
    var statusEl = document.getElementById("pullStatus");
    var timeEl = document.getElementById("pullTime");

    var THRESHOLD = 60;  // 下拉超过这个距离松手才会触发刷新
    var MAX_PULL = 92;   // 视觉上允许下拉的最大距离（带阻尼，指头实际位移会更大）
    var REFRESH_H = 40;  // 刷新中/刷新完成时指示条固定撑开的高度

    var touchTracking = false, touchDecided = null, touchStartX = 0, touchStartY = 0;
    var mouseDragging = false, mouseMoved = false, mouseStartY = 0;
    var dist = 0, refreshing = false;
    var timeCache = null, timeCacheAt = 0;

    function scrollTopPx(){
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    function fmtModTime(iso){
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return fmtBJ(d); // 按北京时间显示（后端记录本身即 +08:00），不随看的人手机时区变化
    }
    /* 最近一次修改时间：复用 loadHistory()，取最新一条的 at 字段；短时间内缓存，避免频繁请求 */
    function loadLastModLabel(force){
      var now = Date.now();
      if (!force && timeCache && (now - timeCacheAt) < 15000) return Promise.resolve(timeCache);
      return loadHistory().then(function(list){
        var label = (list && list.length && list[0] && list[0].at) ? ("最新改动 " + fmtModTime(list[0].at)) : "暂无修改记录";
        timeCache = label; timeCacheAt = Date.now();
        return label;
      });
    }
    function ensureTime(){ loadLastModLabel().then(function(label){ timeEl.textContent = label; }); }

    function updateDrag(rawDelta){
      dist = Math.min(MAX_PULL, Math.max(0, rawDelta * 0.5)); // 简单阻尼，越往下拉越沉
      banner.classList.add("dragging");
      spacer.style.height = dist + "px";
      if (dist >= THRESHOLD){
        iconEl.classList.add("ready");
        statusEl.textContent = "松开刷新";
      } else {
        iconEl.classList.remove("ready");
        statusEl.textContent = "下拉刷新";
      }
      ensureTime();
    }

    function resetVisual(){
      banner.classList.remove("dragging", "ok", "err");
      iconEl.classList.remove("ready", "spin");
      statusEl.textContent = "下拉刷新";
      spacer.style.height = "0px";
      dist = 0;
    }

    function doRefresh(){
      if (refreshing) return;
      refreshing = true;
      banner.classList.remove("dragging", "ok", "err");
      spacer.style.height = REFRESH_H + "px";
      iconEl.classList.remove("ready");
      iconEl.classList.add("spin");
      statusEl.textContent = "刷新中…";
      ensureTime();
      refreshData().then(function(){
        return loadLastModLabel(true);
      }).then(function(label){
        timeEl.textContent = label;
        iconEl.classList.remove("spin");
        banner.classList.add("ok");
        statusEl.textContent = "已是最新 ✓";
      }).catch(function(){
        iconEl.classList.remove("spin");
        banner.classList.add("err");
        statusEl.textContent = "刷新失败，稍后再试";
      }).then(function(){
        setTimeout(function(){
          refreshing = false;
          resetVisual();
        }, 1500);
      });
    }

    /* ===== 移动端：整页手指下拉手势（只在 scrollTop≈0 时激活，避免和正常滚动打架） ===== */
    document.addEventListener("touchstart", function(e){
      if (refreshing || scrollTopPx() > 0 || (e.target.closest && e.target.closest(".princeOverlay"))){
        touchTracking = false; touchDecided = null; return;
      }
      var t = e.touches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
      touchTracking = true; touchDecided = null;
    }, { passive: true });

    document.addEventListener("touchmove", function(e){
      if (!touchTracking || refreshing) return;
      var t = e.touches[0];
      var dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      if (touchDecided === null){
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // 移动太小，先不判断方向
        touchDecided = (dy > 0 && Math.abs(dy) > Math.abs(dx) && scrollTopPx() <= 0) ? "pull" : "other";
      }
      if (touchDecided !== "pull") return;
      if (scrollTopPx() > 0){ touchTracking = false; resetVisual(); return; } // 期间页面被滚动了，取消
      e.preventDefault(); // 阻止原生下拉回弹/刷新，接管为自定义指示条
      updateDrag(dy);
    }, { passive: false });

    function touchFinish(){
      if (!touchTracking) return;
      touchTracking = false;
      if (touchDecided === "pull"){
        if (dist >= THRESHOLD) doRefresh(); else resetVisual();
      }
      touchDecided = null;
    }
    document.addEventListener("touchend", touchFinish, { passive: true });
    document.addEventListener("touchcancel", touchFinish, { passive: true });

    /* ===== 桌面端：在指示条上鼠标下拉 / 悬停显示时间 / 直接点击也能触发刷新 ===== */
    row.addEventListener("mouseenter", function(){ if (!refreshing) ensureTime(); });
    row.addEventListener("mousedown", function(e){
      if (refreshing) return;
      mouseDragging = true; mouseMoved = false; mouseStartY = e.clientY;
      ensureTime();
    });
    window.addEventListener("mousemove", function(e){
      if (!mouseDragging || refreshing) return;
      var dy = e.clientY - mouseStartY;
      if (Math.abs(dy) > 4) mouseMoved = true;
      updateDrag(Math.max(0, dy));
    });
    window.addEventListener("mouseup", function(){
      if (!mouseDragging) return;
      mouseDragging = false;
      if (dist >= THRESHOLD) doRefresh(); else resetVisual();
    });
    row.addEventListener("click", function(){
      if (refreshing || mouseMoved) return; // 有效拖拽已在 mouseup 里处理，避免点击重复触发
      doRefresh();
    });
    row.addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); doRefresh(); }
    });

    ensureTime();
  }

  /* ---------- 启动 ---------- */
  initPrinceFab();
  initPullRefresh();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function(){});
  load().then(function(){
    var page = document.body.getAttribute("data-page");
    if (page === "index") initIndex();
    else if (page === "itin") initItin();
    startDataPolling(); // 每约 30 秒重新拉取 data/*.json 并复用现有渲染函数
  }).catch(function(err){ console.error("数据加载失败", err); });
})();
