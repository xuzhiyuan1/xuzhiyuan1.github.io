/* 曼谷之旅 · 全部逻辑（index.html 与 itinerary.html 共用）。
   纯数据来自 data/site.json / trip.json / guide.json / users.json，
   本文件负责加载与渲染，等价复现原 data.js + 两页内联脚本的可见输出。 */
(function(){
  "use strict";

  var DATA, SITE, GUIDE, USERS, ITINERARY, FLIGHTS, OVERVIEW, DUR;
  var MAP_DEFAULT = "Bangkok Thailand";

  /* ---------- 公共小工具（原 data.js） ---------- */
  function enc(q){ return String(q).replace(/ /g, "+"); }
  function mapA(q){ return ' <a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + enc(q) + '">🧭 导航</a>'; }
  function stripTags(s){ return s.replace(/<[^>]*>/g, "").trim(); }
  function pad(n){ return String(n).padStart(2, "0"); }
  function todayKey(){ var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

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
      var p = FLIGHTS[roleName];
      if (p && p.out) all.push({ t: p.out.t, label: "去程 " + p.out.no + " 起飞" });
      if (p && p.ret) all.push({ t: p.ret.t, label: "返程 " + p.ret.no + " 起飞" });
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

  /* ---------- 数据加载 ---------- */
  function load(){
    return Promise.all([
      fetch("data/site.json").then(function(r){ return r.json(); }),
      fetch("data/trip.json").then(function(r){ return r.json(); }),
      fetch("data/guide.json").then(function(r){ return r.json(); }),
      fetch("data/users.json").then(function(r){ return r.json(); })
    ]).then(function(res){
      DATA = { site: res[0], trip: res[1], guide: res[2], users: res[3] };
      SITE = DATA.site; GUIDE = DATA.guide; USERS = DATA.users;
      ITINERARY = DATA.trip.itinerary; FLIGHTS = DATA.trip.flights;
      OVERVIEW = USERS.overviewLabel;
      DUR = '<img class="dur" src="ui/' + SITE.themeImage + '" alt="榴莲">';
      return DATA;
    });
  }

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

    /* ====== 下拉 Tab ====== */
    var tabToggle = $("tabToggle");
    var tabMenu = $("tabMenu");
    tabToggle.addEventListener("click", function(e){
      e.stopPropagation();
      var open = tabMenu.hidden;
      tabMenu.hidden = !open;
      tabToggle.classList.toggle("open", open);
    });
    document.addEventListener("click", function(e){
      if (!tabMenu.hidden && !tabMenu.contains(e.target) && e.target !== tabToggle){ tabMenu.hidden = true; tabToggle.classList.remove("open"); }
    });
    Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(btn){
      btn.addEventListener("click", function(){
        var tab = btn.dataset.tab;
        var isPlan = tab === "plan";
        $("panePlan").hidden = !isPlan;
        $("paneJz").hidden = isPlan;
        Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(b){ b.classList.toggle("active", b === btn); });
        tabToggle.innerHTML = (isPlan ? "日程" : "机酒") + ' <span class="car">▾</span>';
        tabMenu.hidden = true; tabToggle.classList.remove("open");
      });
    });

    /* ====== 角色选择 ====== */
    var whoSel = $("who");
    USERS.roles.concat([OVERVIEW]).forEach(function(n){ whoSel.add(new Option(n, n)); });
    var saved = localStorage.getItem("who");
    whoSel.value = (saved && (FLIGHTS[saved] || saved === OVERVIEW)) ? saved : USERS.defaultRole;

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

    /* ====== 航班卡 ====== */
    function fcard(kind, leg, mine){
      var lab = '<div class="flabel">' + kind + '</div>';
      if (!leg) return lab + '<div class="fcard"><div class="fmeta">航班待补充</div></div>';
      var meta = leg.meta + (leg.price ? ' · ' + leg.price : '');
      return lab + '<div class="fcard' + (mine ? ' mine' : '') + '">' +
        '<div class="frow2"><span class="no">' + leg.air + ' ' + leg.no + '</span><span class="fdur">✈ ' + leg.dur + '</span></div>' +
        '<div class="fmeta">' + meta + '</div>' +
        '<div class="froute">' +
          '<div class="fend"><div class="fcity">' + leg.depCity + '</div><div class="ftime" data-bj="' + leg.depBJ + '" data-th="' + leg.depTH + '">' + leg.depBJ + '</div></div>' +
          '<div class="farrow">→</div>' +
          '<div class="fend r"><div class="fcity">' + leg.arrCity + '</div><div class="ftime" data-bj="' + leg.arrBJ + '" data-th="' + leg.arrTH + '">' + leg.arrBJ + '</div></div>' +
        '</div>' +
        '</div>';
    }
    function renderFlights(){
      var box = $("flightBox");
      if (whoSel.value === OVERVIEW){
        box.innerHTML = USERS.roles.map(function(n){
          var p = FLIGHTS[n];
          return '<div class="pname">' + n + '</div>' + fcard("去程", p.out, false) + fcard("返程", p.ret, false);
        }).join("");
      } else {
        var p = FLIGHTS[whoSel.value];
        box.innerHTML = fcard("去程", p.out, true) + fcard("返程", p.ret, true) + (p.note ? '<div class="note">' + p.note + '</div>' : '');
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
    }
    whoSel.addEventListener("change", function(){ localStorage.setItem("who", whoSel.value); renderAll(); });
    renderAll();
    setInterval(renderNow, 1000);        // 倒计时每秒更新
    setInterval(renderSchedule, 60000);  // 每分钟刷新一次"未完成行程"列表

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
    setInterval(render, 30000);
  }

  /* ---------- 启动 ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function(){});
  load().then(function(){
    var page = document.body.getAttribute("data-page");
    if (page === "index") initIndex();
    else if (page === "itin") initItin();
  }).catch(function(err){ console.error("数据加载失败", err); });
})();
