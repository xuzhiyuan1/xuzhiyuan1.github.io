/* 2610Paris · 城、山、海之旅 · index.html 与 itinerary.html 共用。
   仿照曼谷站 app.js：数据优先实时读后端（CONFIG.BACKEND_URL，秒级更新），
   后端不可达时兜底读本仓库 data/site.json / trip.json / guide.json / users.json
   （每天备份一次的静态副本）。
   本文件负责加载与渲染，等价复现原 data.js + 两页内联脚本的可见输出。 */
(function(){
  "use strict";

  /* ============================================================
     CONFIG（每次旅行都拥有自己的路径级 API）
     · Cloudflare 将 /2610Paris/* 转到独立状态目录和独立进程。
     · trip-guard 仍保留，防止日后路由配置错误时把其它旅行的数据渲染到本站。
     ============================================================ */
  var CONFIG = {
    BACKEND_URL: "https://trip.xuzhiyuan1.top/2610Paris",
    BACKEND_TIMEOUT_MS: 5000, // 后端请求超时：超时/失败一律回退到仓库静态 JSON，保证不白屏
    // 期望的「这次行程」标识：后端 /data 里 site.brandTitle 或 site.dates 命中这里任一关键字即视为本次行程
    EXPECTED_TRIP_KEYWORDS: ["2610Paris", "巴黎", "Paris"],
    BACKEND_OK: false // 启动时为 false；首次成功拉到匹配 EXPECTED_TRIP_KEYWORDS 的 /data 才置 true
  };

  var DATA, SITE, GUIDE, USERS, ITINERARY, TRANSPORT, OVERVIEW, EIFFEL;
  /* 申根签材料内容来自 2026-france-visa-materials.html；requiredImages 是“已准备”截图的最低数量。 */
  var VISA_SECTIONS = [
    {id:"must", title:"01｜递签文件", desc:"这些是进 TLS 前就应打印好的文件。", items:[
      {id:"fv-form", title:"France-Visas 申请表 + 回执", hint:"先完成最终确认，再分别打印。按页面要求由本人签名。", status:"待完成", requiredImages:2},
      {id:"tls-letter", title:"TLS 预约确认信", hint:"打印，递签当日携带；核对预约中心、日期和时间。", status:"核对", requiredImages:1},
      {id:"consent", title:"个人信息处理及跨境传输同意书", hint:"从 TLS 北京网站下载、填写并签名。", status:"待打印", requiredImages:1},
      {id:"checklist", title:"France-Visas 个性化材料清单", hint:"第六页的清单打印出来，作为材料排序依据。", status:"待打印", requiredImages:1}
    ]},
    {id:"identity", title:"02｜护照与身份", desc:"原件用于核验，复印件留入申请档案。", items:[
      {id:"passport", title:"护照原件", hint:"至少两页连续空白页；离开申根区后至少仍有效三个月。递签当天交给 TLS。", status:"带原件", requiredImages:2},
      {id:"passport-copy", title:"护照复印件", hint:"信息页，以及所有含签证、出入境章或其他批注的页面。", status:"待复印", requiredImages:2},
      {id:"photo", title:"近期申根规格证件照", hint:"带 1 张，另备 1 张更稳妥；避免日常生活照。", status:"待准备", requiredImages:2}
    ]},
    {id:"trip", title:"03｜行程、机票与住宿", desc:"核心是时间、入住人姓名与申请表完全一致。", items:[
      {id:"itinerary", title:"英文或法文完整行程单", hint:"写明北京→布鲁塞尔→法国为主→布鲁塞尔→北京；法国为停留时间最长的国家。", status:"待导出", requiredImages:1},
      {id:"flight", title:"中国往返申根区的机票订单 / 电子客票", hint:"北京—布鲁塞尔及布鲁塞尔—北京，须能看见姓名、日期、航班与订单状态。", status:"核对姓名", requiredImages:1},
      {id:"hotel", title:"全程酒店订单", hint:"每晚都覆盖；订单中应显示入住人、入住日期、酒店地址及付款状态。当地城市税到店付不影响“房费已付”。", status:"已付款", requiredImages:1},
      {id:"euro-transport", title:"已购买的欧洲境内交通（如有）", hint:"真实已购买的票据一并附上。未购买的部分以真实行程单说明，不制作虚假预订单。", status:"如有再放", requiredImages:1}
    ]},
    {id:"student", title:"04｜在读身份与回国约束", desc:"你以学生身份申请，重点是清华在读证明，而不是工作证明。", items:[
      {id:"enrolment", title:"清华大学英文在读证明", hint:"最好含姓名、学号、在读项目、预计毕业时间、学校联系方式，并盖章或具备可验证方式。", status:"待开具", requiredImages:1},
      {id:"student-card", title:"学生证复印件（辅助）", hint:"不是替代在读证明，但可一并附上。", status:"可选", requiredImages:1}
    ]},
    {id:"funds", title:"05｜资金证明", desc:"证明你能自行负担旅行费用，并有稳定的个人财务记录。", items:[
      {id:"bank", title:"本人名下近三个月银行流水", hint:"优先选择有银行盖章或电子验真的版本；体现正常收支、足以覆盖行程的余额。", status:"待打印", requiredImages:2},
      {id:"translation", title:"中文材料的英文说明 / 翻译", hint:"若流水或在读材料仅有中文，附英文翻译更稳妥；无须自行虚构或修改交易记录。", status:"按实际", requiredImages:1},
      {id:"card-proof", title:"信用卡证明（辅助）", hint:"如要附，只保留必要信息；不要提交卡背面或 CVV。", status:"可选", requiredImages:1}
    ]},
    {id:"insurance", title:"06｜旅行医疗保险", desc:"短期申根旅游签证的强制材料。", items:[
      {id:"insurance-policy", title:"英文保险凭证与保单", hint:"覆盖整个申根区和整个停留期；至少 €30,000，含紧急医疗、住院与医疗遣返。建议投保日覆盖 10 月 3—13 日并留少量缓冲。", status:"待购买", requiredImages:2}
    ]},
    {id:"letter", title:"07｜建议附加：英文说明信", desc:"不是用来替代证明，而是把多国行程的逻辑讲清楚。", items:[
      {id:"cover-letter", title:"英文说明信（建议准备）", hint:"一页足够：旅游目的；法国停留最久；比利时首入境与离境；酒店和国际机票已落实；本人承担费用、旅行后返回清华继续学业。", status:"建议准备", requiredImages:1}
    ]}
  ];
  var VISA_ITEM_MAP = {};
  VISA_SECTIONS.forEach(function(section){ section.items.forEach(function(item){ VISA_ITEM_MAP[item.id] = item; }); });
  /* 参考页中每个材料的“点击展开说明”。正文是静态编辑内容，不来自用户输入。 */
  var VISA_DETAILS = {
    "fv-form":"<p>这是在线申请完成后生成的两份核心文件。TLS 要求携带打印件，并由申请人本人在签名位置签字。</p><ul><li>打印前核对姓名、护照号、出生日期、入离境日期、住宿和资金方式。</li><li>申请表必须与 TLS 账户及护照完全一致；有错误应回 France-Visas 更正后重新生成。</li></ul><div class=\"visaDetailSource\">依据：TLS 递签流程与表格下载说明。</div>",
    "tls-letter":"<p>这是预约当天进入签证中心的凭证。打印纸质版，检查中心为北京、日期为 2026 年 9 月 11 日、申请人姓名无误。</p><ul><li>电子版可存手机，但以纸质版为主。</li><li>按预约时间到达，迟到可能无法当天受理。</li></ul><div class=\"visaDetailSource\">依据：TLScontact 北京递签流程。</div>",
    "consent":"<p>TLS 中国网站提供个人信息处理及跨境传输同意书。按表格要求填写、签名，不要替同行人代签。</p><div class=\"visaDetailSource\">依据：TLScontact 表格与下载文件。</div>",
    "checklist":"<p>这是 France-Visas 根据本次旅游、学生身份和费用承担情况生成的个性化清单，优先级高于经验帖。</p><ul><li>按清单顺序排放材料。</li><li>清单写明原件和复印件的项目，两者都带。</li><li>若本页与最新清单不一致，以 France-Visas 和 TLS 的最新要求为准。</li></ul>",
    "passport":"<p>确认至少有两页连续空白页，并且从离开申根区之日起仍有三个月以上有效期。</p><ul><li>护照原件递签当天交给 TLS。</li><li>递签后护照会进入审核流程，不要安排冲突的出境用途。</li></ul>",
    "passport-copy":"<p>复印护照信息页，以及所有含签证、出入境章或其他批注的页面。</p><ul><li>复印件要清晰完整，不要裁掉页码和边缘。</li><li>空白页通常不用逐页复印，除非个性化清单另有要求。</li></ul>",
    "photo":"<p>准备近期、正面、清晰的 ICAO 规格证件照。一张递交，一张备用。</p><ul><li>不要使用生活照、自拍照或明显修图照。</li><li>避免因尺寸或背景不合格在现场重拍。</li></ul>",
    "itinerary":"<p>行程单要把机票、酒店与多国停留串成一条可信路线，不等于虚构交通订单。</p><ul><li>按日列出日期、城市、住宿和主要跨城移动。</li><li>明确 10 月 3 日比利时入境、法国停留时间最长、10 月 13 日比利时离境。</li><li>日期必须与申请表、酒店和机票订单吻合。</li></ul>",
    "flight":"<p>准备北京—布鲁塞尔及布鲁塞尔—北京的真实订单或电子客票。</p><ul><li>英文姓名必须与护照一致。</li><li>订单需完整显示状态、航班号、日期和航段。</li><li>不要提交无法验证或虚构的预订单。</li></ul>",
    "hotel":"<p>酒店订单应连续覆盖全部住宿夜晚，并显示酒店名、地址、入住人、入住/退房日期和付款状态。</p><ul><li>房费线上已付、城市税到店支付是正常情况。</li><li>订单日期必须与行程单一致。</li></ul>",
    "euro-transport":"<p>已购买的火车或航班票可支撑行程；尚未购买时，不要为了材料完整制作假票。</p><ul><li>已购买：放入对应日程之后。</li><li>未购买：在真实行程单写清交通方式、航班号或车次（如已知）。</li></ul>",
    "enrolment":"<p>英文在读证明说明学生身份和旅行后继续学业的回国约束。</p><ul><li>建议包含姓名、学号、项目、预计毕业日期、学校联系方式和开具日期。</li><li>使用正式抬头纸并盖章或提供可验证方式。</li><li>不需要用工作证明替代在读证明。</li></ul>",
    "student-card":"<p>学生证不能替代在读证明，只作为辅助材料放在在读证明之后。</p><ul><li>复印有姓名、学校和有效信息的页面。</li><li>过期或信息不完整时不要把它当主要证明。</li></ul>",
    "bank":"<p>重点是连续、真实且能解释的个人资金流，而不是某一天的余额。</p><ul><li>优先使用银行盖章件或电子验真版本。</li><li>大额转入要准备真实来源说明。</li><li>不要临时存入无法解释的大额资金。</li></ul>",
    "translation":"<p>France-Visas 提示材料应提供法文或英文版本。纯中文流水等可附简明英文翻译辅助理解。</p><ul><li>翻译必须忠实对应原文件，金额、日期和姓名不能改写。</li><li>是否需要公证，以个性化清单和 TLS 最新要求为准。</li></ul>",
    "card-proof":"<p>信用卡证明只能辅助说明支付能力，不能取代本人银行流水。</p><ul><li>只显示必要的持卡人姓名与末四位。</li><li>遮住完整卡号、有效期、CVV 和动态验证码。</li></ul>",
    "insurance-policy":"<p>保险必须覆盖整个申根区和整个实际停留期，保额至少 €30,000，并包含紧急医疗、住院和医疗遣返。</p><ul><li>建议覆盖 10 月 3—13 日并留少量缓冲。</li><li>选择能出具英文凭证的保险。</li><li>被保险人英文姓名要与护照拼写相同。</li></ul>",
    "cover-letter":"<p>说明信只解释已有材料，不编造新的事实，一页 A4 足够。</p><ul><li>写明旅游目的、日期、比利时首入境/离境和法国最长停留。</li><li>说明费用由本人承担，酒店和国际机票有对应订单。</li><li>说明自己是清华在读学生，旅行后返回中国继续学业。</li><li>结尾列出行程、机票、酒店、在读证明、流水和保险等附件。</li></ul>"
  };
  var MAP_DEFAULT = "Paris France";
  // 出发前不预填任何回顾；旅程结束后才由真实记录填入。
  var EMPTY_REVIEW = { title: "回顾", sections: [] };
  var pageRender = null; /* 当前页面的"用最新 DATA 重新渲染"函数：index=renderAll，itin=render */
  var activateTab = null; /* index 页专属：切 tab 函数（由 initIndex 内的 showTab 赋值），供小王子对话框
                              "查看攻略本"按钮跨作用域调用；itinerary 页没有 tab 结构，此值保持 null，
                              对话框那边会退化成跳转到 index.html#guide */

  /* ---------- 公共小工具（原 data.js） ---------- */
  function enc(q){ return String(q).replace(/ /g, "+"); }
  function mapA(q){ return ' <a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + enc(q) + '">导航</a>'; }
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

  function stripEmoji(s){
    return String(s || "").replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, "").trim();
  }
  function stripLeadingEmoji(s){
    return String(s || "").replace(/^[^\p{L}\p{N}]+/u, "");
  }

  /* 逐日行程正文；每个 place 追加导航按钮。 */
  function renderItemBody(it){
    var s = stripLeadingEmoji(String(it.title || "").replace(/\{durian\}/g, ""));
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
      if (r.href) return '<a target="_blank" rel="noopener" href="' + r.href + '">' + stripEmoji(r.t) + '</a>';
      if (r.b != null) return '<b>' + stripEmoji(r.b) + '</b>';
      return stripEmoji(r.t);
    }).join("");
  }
  function guideLi(item){
    return '<li>' + runsHTML(item.runs) + (item.place ? mapA(item.place) : "") + '</li>';
  }

  /* ---------- 数据加载：优先读后端实时接口，超时/失败/串了别站 兜底读仓库静态 JSON ---------- */

  /* 带超时的 fetch：用 AbortController，超过 ms 毫秒直接判定失败（不无限等） */
  function fetchWithTimeout(url, ms, opts){
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms) : null;
    var o = opts || {};
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function(r){ clearTimeout(timer); return r; }, function(err){ clearTimeout(timer); throw err; });
  }

  /* 判断后端返回的 bundle 是不是「本次行程」的：site.brandTitle / dates / 任何深字段里
     只要命中 EXPECTED_TRIP_KEYWORDS 任一关键字即可。命中失败视为另一站点的后端，
     抛出错误让上层回退到仓库静态 JSON，避免拿到其它站点的数据。 */
  function bundleIsForThisTrip(bundle){
    if (!bundle || typeof bundle !== "object") return false;
    try {
      var dump = JSON.stringify(bundle);
      var kws = CONFIG.EXPECTED_TRIP_KEYWORDS || [];
      for (var i = 0; i < kws.length; i++){ if (dump.indexOf(kws[i]) !== -1) return true; }
    } catch (_e) { /* JSON.stringify 在循环引用时会抛，按「不是本站」处理 */ }
    return false;
  }

  /* 主路径：GET {BACKEND_URL}/data 一次性返回整个 bundle {site,trip,guide,users,review,guidebook} */
  function loadFromBackend(){
    return fetchWithTimeout(CONFIG.BACKEND_URL + "/data", CONFIG.BACKEND_TIMEOUT_MS).then(function(r){
      if (!r.ok) throw new Error("后端 /data HTTP " + r.status);
      return r.json();
    }).then(function(bundle){
      if (!bundle || !bundle.site || !bundle.trip || !bundle.guide || !bundle.users){
        throw new Error("后端 /data 返回结构不完整");
      }
      if (!bundleIsForThisTrip(bundle)){
        throw new Error("后端 /data 不是本次行程（期望含 " + (CONFIG.EXPECTED_TRIP_KEYWORDS || []).join(" / ") + "）");
      }
      CONFIG.BACKEND_OK = true; // 通过 trip-guard 之后才标记可用，其它接口（/history / /edit / /exchange）才能用
      return bundle;
    });
  }

  /* 兜底路径：分别 fetch 本仓库 data/*.json（带时间戳防缓存），拼成同样结构的 bundle。
     行程回顾 / 攻略本也一并读取；任何 404/解析失败都降级为内嵌默认值，绝不白屏。 */
  function loadFromRepo(){
    var qs = "?t=" + Date.now();
    function fetchJSON(p){ return fetch(p + qs).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }); }
    function pick(p, fallback){ return fetchJSON(p).then(function(d){ return d == null ? fallback : d; }); }
    return Promise.all([
      fetchJSON("data/site.json"),
      fetchJSON("data/trip.json"),
      fetchJSON("data/guide.json"),
      fetchJSON("data/users.json"),
      pick("data/review.json", EMPTY_REVIEW),
      pick("data/guidebook.json", [])
    ]).then(function(res){
      return { site: res[0], trip: res[1], guide: res[2], users: res[3], review: res[4], guidebook: (res[5] || []).slice() };
    });
  }

  function load(){
    return loadFromBackend().catch(function(err){
      console.warn("后端 /data 不可达 / 不是本次行程，回退到仓库静态 JSON（最近一次备份）：", err);
      return loadFromRepo();
    }).then(function(bundle){
      DATA = bundle;
      SITE = DATA.site; GUIDE = DATA.guide; USERS = DATA.users;
      ITINERARY = DATA.trip.itinerary; TRANSPORT = DATA.trip.transport;
      OVERVIEW = USERS.overviewLabel;
      EIFFEL = '<img class="dur" src="ui/eiffel.svg" alt="埃菲尔铁塔"> ';
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

  /* ---------- 修改记录：优先读后端；不可用时读取静态兜底。 ---------- */
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
    if (!CONFIG.BACKEND_OK){
      return loadHistoryFromRepo().then(function(arr){ return arr.slice().reverse(); });
    }
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
     交通样式库：每种交通方式一款样式（本次布鲁塞尔之旅用「机票」款）。
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
        '<div class="frow2"><span class="no">' + seg.air + ' ' + seg.no + '</span><span class="fdur">' + seg.dur + '</span></div>' +
        '<div class="fmeta">' + meta + '</div>' +
        '<div class="froute">' +
          '<div class="fend"><div class="fcity">' + seg.depCity + '</div><div class="ftime" data-bj="' + seg.depBJ + '" data-be="' + seg.depBE + '">' + seg.depBJ + '</div></div>' +
          '<div class="farrow">→</div>' +
          '<div class="fend r"><div class="fcity">' + seg.arrCity + '</div><div class="ftime" data-bj="' + seg.arrBJ + '" data-be="' + seg.arrBE + '">' + seg.arrBJ + '</div></div>' +
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
    $("heroTag").innerHTML = String(SITE.heroTag).replace(/\{durian\}/g, "").trim();
    $("nowWx").textContent = stripLeadingEmoji(SITE.weatherBrief);

    /* 攻略：实用提醒 */
    $("tipsList").innerHTML = GUIDE.practicalTips.filter(function(item){
      var text = JSON.stringify(item || {});
      return text.indexOf("华夫饼") === -1 && text.indexOf("Waffle") === -1;
    }).map(guideLi).join("");

    /* ====== 下拉 Tab（日程 / 回顾 / 机酒 / 申根签证 / 攻略本） ====== */
    var tabToggle = $("tabToggle");
    var tabMenu = $("tabMenu");
    var TAB_LABELS = { review: "回顾", plan: "日程", jz: "机酒", visa: "申根签", guide: "攻略本" };
    var TAB_PANES = { review: "paneReview", plan: "panePlan", jz: "paneJz", visa: "paneVisa", guide: "paneGuide" };
    tabToggle.addEventListener("click", function(e){
      e.stopPropagation();
      var open = tabMenu.hidden;
      tabMenu.hidden = !open;
      tabToggle.classList.toggle("open", open);
      if (typeof roleMenu !== "undefined" && roleMenu){ roleMenu.hidden = true; roleToggle.classList.remove("open"); roleToggle.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("click", function(e){
      if (!tabMenu.hidden && !tabMenu.contains(e.target) && e.target !== tabToggle){ tabMenu.hidden = true; tabToggle.classList.remove("open"); }
    });
    /* 切 tab：按 tab 名显示对应 pane、同步下拉高亮态与折叠按钮文案。挂到模块级 activateTab，
       供小王子对话框"查看攻略本"按钮直接调用（不用等下拉菜单里的按钮被点） */
    function showTab(tab){
      if (!TAB_LABELS[tab]) return;
      Object.keys(TAB_PANES).forEach(function(t){
        var el = $(TAB_PANES[t]);
        if (el) el.hidden = (t !== tab);
      });
      Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(b){ b.classList.toggle("active", b.dataset.tab === tab); });
      tabToggle.innerHTML = TAB_LABELS[tab] + ' <span class="car">▾</span>';
      tabMenu.hidden = true; tabToggle.classList.remove("open");
      /* 每次切进攻略本 tab，重新随机一遍顶部推荐胶囊（数据已加载时才有意义，见 renderGuideRandom 的空判断） */
      if (tab === "guide" && typeof renderGuideRandom === "function") renderGuideRandom();
    }
    Array.prototype.forEach.call(tabMenu.querySelectorAll("button"), function(btn){
      btn.addEventListener("click", function(){ showTab(btn.dataset.tab); });
    });
    activateTab = showTab;
    /* 从 itinerary 页点"查看攻略本"会跳到 index.html#guide；这里接住这个 hash，直接打开攻略本 tab，
       然后把 hash 清掉（history.replaceState），避免刷新/分享链接时又重复触发 */
    if (location.hash === "#guide"){
      showTab("guide");
      if (window.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    }

    function renderReview(){
      var box = $("reviewCards");
      if (!box) return;
      var review = DATA.review || EMPTY_REVIEW;
      var sections = Array.isArray(review.sections) ? review.sections : [];
      if (!sections.length){
        box.innerHTML = '<div class="card reviewEmpty">旅行尚未开始，暂时没有可回顾的内容。</div>';
        return;
      }
      box.innerHTML = sections.map(function(item){
        return '<article class="card reviewCard">' +
          '<div class="reviewContent"><h2>' + escapeHtml(item.title || "回顾") + '</h2>' +
          (item.entries || []).map(function(entry){ var style = entry.style || {}; var cls = "reviewHighlight" + (style.size === "large" ? " large" : "") + (style.color === "warm" ? " warm" : ""); return '<div class="reviewEntry"><span class="reviewBy">' + escapeHtml(entry.by || "匿名") + '</span><div class="reviewEntryBody"><strong class="' + cls + '">' + escapeHtml(entry.highlight || "") + '</strong><p>' + escapeHtml(entry.text || "") + '</p>' + (entry.tip ? '<div class="reviewTip"><b>下次</b>' + escapeHtml(entry.tip) + '</div>' : '') + '</div></div>'; }).join('') +
          '</div></article>';
      }).join('');
    }

    /* ====== 角色选择 ====== */
    var whoSel = $("who");
    USERS.roles.concat([OVERVIEW]).forEach(function(n){ whoSel.add(new Option(n, n)); });
    var saved = localStorage.getItem("who");
    whoSel.value = (saved && (TRANSPORT[saved] || saved === OVERVIEW)) ? saved : USERS.defaultRole;
    /* 角色菜单复用日程/机酒的同一套下拉样式；隐藏 select 仅保留为既有渲染与小王子对话的状态源。 */
    var roleToggle = $("roleToggle");
    var roleMenu = $("roleMenu");
    function syncRoleMenu(){
      var current = whoSel.value;
      roleToggle.innerHTML = escapeHtml(current) + ' <span class="car">▾</span>';
      roleToggle.setAttribute("aria-expanded", String(!roleMenu.hidden));
      Array.prototype.forEach.call(roleMenu.querySelectorAll("button"), function(button){ button.classList.toggle("active", button.dataset.role === current); });
    }
    USERS.roles.concat([OVERVIEW]).forEach(function(name){
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.role = name;
      button.textContent = name;
      button.addEventListener("click", function(){
        whoSel.value = name;
        whoSel.dispatchEvent(new Event("change"));
        roleMenu.hidden = true;
        roleToggle.classList.remove("open");
        roleToggle.setAttribute("aria-expanded", "false");
      });
      roleMenu.appendChild(button);
    });
    roleToggle.addEventListener("click", function(e){
      e.stopPropagation();
      var open = roleMenu.hidden;
      roleMenu.hidden = !open;
      roleToggle.classList.toggle("open", open);
      roleToggle.setAttribute("aria-expanded", String(open));
      tabMenu.hidden = true;
      tabToggle.classList.remove("open");
    });
    document.addEventListener("click", function(e){
      if (!roleMenu.hidden && !roleMenu.contains(e.target) && e.target !== roleToggle){
        roleMenu.hidden = true;
        roleToggle.classList.remove("open");
        roleToggle.setAttribute("aria-expanded", "false");
      }
    });
    syncRoleMenu();

    /* ====== 申根签材料：按角色保存勾选与准备截图 ====== */
    var visaState = { author: "", items: {} };
    var visaBusy = false;
    function visaItemState(id){ return visaState.items[id] || {checked:false, images:[]}; }
    function visaTotals(){
      var checked = 0, total = 0, imageCount = 0, imageRequired = 0;
      VISA_SECTIONS.forEach(function(section){ section.items.forEach(function(item){
        var state = visaItemState(item.id); total++; if (state.checked) checked++;
        imageCount += (state.images || []).length; imageRequired += item.requiredImages;
      }); });
      return {checked:checked,total:total,imageCount:imageCount,imageRequired:imageRequired};
    }
    function visaStatusText(item, state){
      var n = (state.images || []).length, required = item.requiredImages;
      if (state.checked && n >= required) return "已准备";
      if (state.checked) return "已勾选 · 还差 " + Math.max(0, required - n) + " 张截图";
      return item.status;
    }
    function visaRender(){
      var box = $("visaChecklistApp"), progress = $("visaProgress");
      if (!box || !progress) return;
      if (whoSel.value === OVERVIEW){
        progress.innerHTML = '<div class="visaProgressTitle">材料准备进度</div><p class="visaReadonly">请选择徐致远、王俊杰或焦泓程后，再记录各自的材料和截图。不同角色的数据完全分开。</p>';
        box.innerHTML = '<div class="card visaEmpty">当前是总览角色，不能写入个人签证材料。请从右上角角色菜单选择申请人。</div>';
        return;
      }
      var totals = visaTotals(), pct = totals.total ? Math.round(totals.checked / totals.total * 100) : 0;
      progress.innerHTML = '<div class="visaProgressTop"><div><div class="visaProgressTitle">' + escapeHtml(visaState.author) + ' · 材料准备进度</div><span class="visaProgressMeta">已勾选 ' + totals.checked + ' / ' + totals.total + ' 项 · 已上传 ' + totals.imageCount + ' 张截图（最低建议 ' + totals.imageRequired + ' 张）</span></div><span class="visaPercent">' + pct + '%</span></div><div class="visaProgressTrack"><span style="width:' + pct + '%"></span></div><p class="visaReadonly">勾选表示材料已经准备好；每项可上传对应的截图作为留痕。图片会和当前角色绑定，徐致远与王俊杰互不影响。</p>';
      box.innerHTML = VISA_SECTIONS.map(function(section){
        return '<section class="card visaChecklistGroup" id="visa-' + section.id + '"><div class="visaSectionHead"><div><h2>' + section.title + '</h2><p>' + section.desc + '</p></div><span class="visaSectionCount">' + section.items.filter(function(i){ return visaItemState(i.id).checked; }).length + ' / ' + section.items.length + '</span></div><ul class="visaChecklist">' + section.items.map(function(item){
          var state = visaItemState(item.id), images = state.images || [], ready = state.checked && images.length >= item.requiredImages;
          return '<li class="visaTask ' + (ready ? 'isReady' : '') + '"><div class="visaTaskMain"><label class="visaCheck"><input type="checkbox" data-visa-check="' + item.id + '" ' + (state.checked ? 'checked' : '') + '><span class="visaFakeCheck"></span></label><div class="visaTaskCopy"><details class="visaInlineDetail"><summary><b>' + escapeHtml(item.title) + '</b><span class="visaHint">' + escapeHtml(item.hint) + '</span><span class="visaOpenDetail">点击展开材料说明与依据</span></summary><div class="visaDetailBody">' + (VISA_DETAILS[item.id] || '<p>请以 France-Visas 个性化清单和 TLS 最新要求为准。</p>') + '</div></details><span class="visaEvidence">截图 ' + images.length + ' / ' + item.requiredImages + ' · ' + escapeHtml(visaStatusText(item, state)) + '</span></div><div class="visaUpload"><input class="visaUploadInput" type="file" accept="image/*" multiple data-visa-upload="' + item.id + '"><button type="button" data-visa-upload-btn="' + item.id + '">上传截图</button></div></div>' + (images.length ? '<div class="visaThumbs">' + images.map(function(image){ return '<figure><img src="' + image.src + '" alt="' + escapeHtml(image.name || '材料截图') + '"><button type="button" data-visa-remove="' + item.id + '" data-image-id="' + escapeHtml(image.id) + '" aria-label="删除截图">×</button></figure>'; }).join('') + '</div>' : '') + '</li>';
        }).join('') + '</ul>' + (section.id === 'trip' ? '<div class="visaTip"><strong>这次特别要说清：</strong>首入境是比利时并不妨碍申请法国；行程单和说明信应清楚显示法国是主要停留地。</div>' : '') + '</section>';
      }).join('');
      bindVisaEvents();
    }
    function visaRequest(payload){
      payload.author = whoSel.value;
      return fetchWithTimeout(CONFIG.BACKEND_URL + "/visa", CONFIG.BACKEND_TIMEOUT_MS, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)}).then(function(r){ if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || "保存失败"); }); return r.json(); }).then(function(data){ if (!data.ok) throw new Error(data.error || "保存失败"); visaState = {author:data.author, items:data.items || {}}; visaRender(); return data; });
    }
    function loadVisaState(author){
      if (!author || author === OVERVIEW){ visaState = {author:author || "", items:{}}; visaRender(); return Promise.resolve(); }
      visaBusy = true;
      return fetchWithTimeout(CONFIG.BACKEND_URL + "/visa?author=" + encodeURIComponent(author), CONFIG.BACKEND_TIMEOUT_MS).then(function(r){ if (!r.ok) throw new Error("签证状态加载失败"); return r.json(); }).then(function(data){ visaState = {author:author, items:data.items || {}}; visaRender(); }).catch(function(err){ visaState = {author:author, items:{}}; visaRender(); console.warn(err); }).then(function(){ visaBusy = false; });
    }
    function readVisaFile(file){
      return new Promise(function(resolve, reject){ var reader = new FileReader(); reader.onload = function(){ resolve({name:file.name, type:file.type || "image/jpeg", data:reader.result}); }; reader.onerror = reject; reader.readAsDataURL(file); });
    }
    function bindVisaEvents(){
      Array.prototype.forEach.call(document.querySelectorAll("[data-visa-check]"), function(input){ input.addEventListener("change", function(){ visaRequest({itemId:input.dataset.visaCheck, checked:input.checked}).catch(function(err){ input.checked = !input.checked; alert(err.message); }); }); });
      Array.prototype.forEach.call(document.querySelectorAll("[data-visa-upload-btn]"), function(button){ button.addEventListener("click", function(){ var input = document.querySelector('[data-visa-upload="' + button.dataset.visaUploadBtn + '"]'); if (input) input.click(); }); });
      Array.prototype.forEach.call(document.querySelectorAll("[data-visa-upload]"), function(input){ input.addEventListener("change", function(){ var files = Array.prototype.slice.call(input.files || []).slice(0, 6); if (!files.length) return; Promise.all(files.map(readVisaFile)).then(function(encoded){ return visaRequest({itemId:input.dataset.visaUpload, files:encoded}); }).catch(function(err){ alert("截图上传失败：" + err.message); }); input.value = ""; }); });
      Array.prototype.forEach.call(document.querySelectorAll("[data-visa-remove]"), function(button){ button.addEventListener("click", function(){ if (!confirm("删除这张材料截图？")) return; visaRequest({itemId:button.dataset.visaRemove, removeImageIds:[button.dataset.imageId]}).catch(function(err){ alert(err.message); }); }); });
    }
    function visaShowIfNeeded(){ if (whoSel.value !== OVERVIEW && (!visaState.author || visaState.author !== whoSel.value)) loadVisaState(whoSel.value); }

    /* ====== 时区切换（默认北京时间，机酒 tab 用） ====== */
    /* 时区状态按行程隔离，避免曼谷页留下的 "th" 覆盖欧洲页；并把异常旧值恢复为北京时间。 */
    var tzStorageKey = "travel-tz-2610Paris";
    var tz = localStorage.getItem(tzStorageKey) || "bj";
    if (tz !== "bj" && tz !== "be") tz = "bj";
    function applyTz(){
      var els = document.querySelectorAll(".ftime");
      for (var i = 0; i < els.length; i++){ els[i].textContent = (tz === "bj" ? els[i].dataset.bj : els[i].dataset.be); }
      $("tzbtn").textContent = stripLeadingEmoji(tz === "bj" ? SITE.timezones.bj.label : SITE.timezones.be.label);
    }
    $("tzbtn").addEventListener("click", function(){
      tz = (tz === "bj" ? "be" : "bj"); localStorage.setItem(tzStorageKey, tz); applyTz();
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

    /* ====== 攻略本（DATA.guidebook：大家跟小王子聊天时自动攒的攻略/问答，最新在上） ======
       - 顶部「随机推荐」：随机挑几条做成小胶囊，点了滚动+展开对应卡片
       - 每张卡默认收起（问题/要点 + 答案摘要 + 展开按钮），点开显示完整 Markdown 渲染 */
    var guideCardsBox = $("guideCards");
    var guideRandomBox = $("guideRandom");

    function truncate(s, n){
      s = String(s == null ? "" : s);
      return s.length > n ? s.slice(0, n) + "…" : s;
    }
    /* 从原始（未渲染）Markdown 里抠一份纯文本预览：去掉标题号/列表号/粗斜体符号/链接语法/表格竖线，
       多个换行合并成空格。给"摘要"和"随机推荐胶囊标签"共用，避免展示 Markdown 语法符号或对已转义的
       HTML 再转义一遍（那样 & 之类字符会变成 &amp;amp; 这种双重转义）。 */
    function mdPlainPreview(raw){
      return String(raw == null ? "" : raw)
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*?/g, "")
        .replace(/`/g, "")
        .replace(/^[-*]\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\|/g, " ")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    /* ---- 极简手写 Markdown → HTML（不引外部库）：
       先整体转义防 XSS，再按行处理 ##/### 小标题、- 列表、| 表格，行内处理 **粗** *斜* `码` [文字](链接)，
       空行分段（<p>），段内单个换行转 <br> ---- */
    function mdInline(s){
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }
    function mdToHtml(src){
      var esc = escapeHtml(src);
      var lines = esc.split(/\r?\n/);
      var html = "", para = [], listItems = null, tableRows = [];
      function isTableLine(l){ return /^\|.*\|$/.test(l.trim()); }
      function isSepLine(l){ return /^\|?[\s:|-]+\|[\s:|-]*\|?$/.test(l.trim()) && l.indexOf("-") > -1; }
      function flushPara(){
        if (para.length){ html += "<p>" + mdInline(para.join("<br>")) + "</p>"; para = []; }
      }
      function flushList(){
        if (listItems){ html += "<ul>" + listItems.map(function(li){ return "<li>" + mdInline(li) + "</li>"; }).join("") + "</ul>"; listItems = null; }
      }
      function flushTable(){
        if (!tableRows.length) return;
        var rows = tableRows.map(function(r){
          return r.trim().replace(/^\||\|$/g, "").split("|").map(function(c){ return c.trim(); });
        });
        var head = null, start = 0;
        if (rows.length > 1 && rows[1].every(function(c){ return /^:?-{1,}:?$/.test(c); })){ head = rows[0]; start = 2; }
        html += '<div class="mdTableWrap"><table class="mdTable">';
        if (head) html += "<thead><tr>" + head.map(function(c){ return "<th>" + mdInline(c) + "</th>"; }).join("") + "</tr></thead>";
        html += "<tbody>";
        for (var i = start; i < rows.length; i++){ html += "<tr>" + rows[i].map(function(c){ return "<td>" + mdInline(c) + "</td>"; }).join("") + "</tr>"; }
        html += "</tbody></table></div>";
        tableRows = [];
      }
      function flushAll(){ flushList(); flushPara(); flushTable(); }
      lines.forEach(function(raw){
        var line = raw.replace(/\s+$/, "");
        if (!line.trim()){ flushAll(); return; }
        if (isTableLine(line)){
          if (isSepLine(line) && !tableRows.length) return; // 孤立分隔线直接忽略
          flushList(); flushPara();
          tableRows.push(line);
          return;
        }
        flushTable();
        if (/^-{3,}$/.test(line.trim())){ flushList(); flushPara(); html += "<hr>"; return; } // 独立一行 --- 当分割线
        var h3 = line.match(/^###\s+(.*)/);
        var h2 = line.match(/^##\s+(.*)/);
        var li = line.match(/^[-*]\s+(.*)/);
        if (h3){ flushList(); flushPara(); html += "<h4>" + mdInline(h3[1]) + "</h4>"; return; }
        if (h2){ flushList(); flushPara(); html += "<h3>" + mdInline(h2[1]) + "</h3>"; return; }
        if (li){
          flushPara();
          if (!listItems) listItems = [];
          listItems.push(li[1]);
          return;
        }
        flushList();
        para.push(line);
      });
      flushAll();
      return html;
    }

    function findGuideCard(gid){
      if (!guideCardsBox) return null;
      var cards = guideCardsBox.querySelectorAll(".guideCard");
      for (var i = 0; i < cards.length; i++){ if (cards[i].getAttribute("data-gid") === gid) return cards[i]; }
      return null;
    }
    function setGuideCardExpanded(card, expanded){
      if (!card) return;
      card.classList.toggle("expanded", expanded);
      var head = card.querySelector(".guideCardHead");
      if (head) head.setAttribute("aria-expanded", expanded ? "true" : "false");
      var icon = card.querySelector(".guideToggleIcon");
      if (icon) icon.textContent = expanded ? "▾" : "▸";
    }
    function expandGuideCardById(gid){
      var card = findGuideCard(gid);
      if (!card) return;
      setGuideCardExpanded(card, true);
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function guideCardHTML(item, idx){
      item = item || {};
      var gid = item.id || ("gc" + idx);
      var authorsArr = (Array.isArray(item.authors) && item.authors.length) ? item.authors : (item.author ? [item.author] : []);
      var authorLabel = authorsArr.join("、");
      var d = item.at ? new Date(item.at) : null;
      var timeLabel = (d && !isNaN(d.getTime())) ? fmtBJ(d) : "";
      var metaHTML = (authorLabel || timeLabel)
        ? '<div class="guideMeta">' + (authorLabel ? "<b>" + escapeHtml(authorLabel) + "</b>" : "<span></span>") + (timeLabel ? "<span>" + timeLabel + "</span>" : "") + "</div>"
        : "";
      var isQa = item.type === "qa";
      var qText = escapeHtml(stripEmoji(item.q || ""));
      var aHtml = mdToHtml(item.a || "");
      var summary = truncate(mdPlainPreview(item.a), 48);
      var headMain = isQa
        ? '<div class="guideQ"><span class="guideTag q">问</span><span>' + qText + "</span></div>"
        : '<div class="guideTitle">' + qText + "</div>";
      return '<div class="card guideCard' + (isQa ? " guideQa" : " guideTip") + '" data-gid="' + escapeHtml(gid) + '">' +
        '<button type="button" class="guideCardHead" aria-expanded="false">' +
          '<div class="guideCardHeadMain">' + headMain +
            (summary ? '<div class="guideSummary">' + escapeHtml(summary) + "</div>" : "") +
          "</div>" +
          '<span class="guideToggleIcon" aria-hidden="true">▸</span>' +
        "</button>" +
        '<div class="guideBody">' +
          '<div class="guideDetail">' + aHtml + "</div>" +
          metaHTML +
        "</div>" +
      "</div>";
    }
    function renderGuidebook(){
      var box = guideCardsBox;
      if (!box) return;
      var list = (DATA.guidebook || []).slice().sort(function(a, b){
        return new Date((b && b.at) || 0).getTime() - new Date((a && a.at) || 0).getTime(); // 最新在上
      });
      if (!list.length){
        box.innerHTML = '<div class="card guideEmpty">还没有攻略，点右下小王子分享一条攻略或问个问题吧。</div>';
      } else {
        box.innerHTML = list.map(guideCardHTML).join("");
      }
      renderGuideRandom();
    }
    /* 顶部「随机推荐」胶囊：从 DATA.guidebook 随机挑 4~6 条（不足则全部挑），截断成短标签；
       每次调用都重新洗牌，供 renderGuidebook()（数据刷新时）与 showTab("guide")（进入 tab 时）复用 */
    function renderGuideRandom(){
      var box = guideRandomBox;
      if (!box) return;
      var list = DATA.guidebook || [];
      if (!list.length){ box.hidden = true; box.innerHTML = ""; return; }
      var pool = list.slice();
      for (var i = pool.length - 1; i > 0; i--){ // Fisher-Yates 洗牌
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      var n = Math.min(pool.length, 4 + Math.floor(Math.random() * 3)); // 4~6 条
      var picked = pool.slice(0, n);
      box.hidden = false;
      box.innerHTML = '<div class="guideRandomHd">随机推荐</div><div class="guideChips">' +
        picked.map(function(item, idx){
          var gid = item.id || ("gc" + idx);
          var label = item.topic ? String(item.topic) : truncate(item.q ? String(item.q) : mdPlainPreview(item.a), 14); // 优先用精简主题字段 topic，无则回退截断预览
          return '<button type="button" class="guideChip" data-gid="' + escapeHtml(gid) + '">' + escapeHtml(label) + "</button>";
        }).join("") + "</div>";
    }
    if (guideCardsBox){
      guideCardsBox.addEventListener("click", function(e){
        var head = e.target.closest ? e.target.closest(".guideCardHead") : null;
        if (!head) return;
        var card = head.closest(".guideCard");
        if (!card) return;
        setGuideCardExpanded(card, !card.classList.contains("expanded"));
      });
    }
    if (guideRandomBox){
      guideRandomBox.addEventListener("click", function(e){
        var chip = e.target.closest ? e.target.closest(".guideChip") : null;
        if (!chip) return;
        expandGuideCardById(chip.getAttribute("data-gid"));
      });
    }

    /* ====== 地图卡（按"今天"动态定位/生成内容） ====== */
    function mapCardHTML(loc, title){
      var locs = (loc && loc.length) ? loc : [MAP_DEFAULT];
      var list = locs.map(function(l){ return '<li>' + l + mapA(l) + '</li>'; }).join("");
      return '<div class="card"><details><summary>' + title + '</summary>' +
        '<iframe class="gmap" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=' + enc(locs[0]) + '&z=12&output=embed"></iframe>' +
        '<ul class="tips" style="margin-top:8px">' + list + '</ul></details></div>';
    }
    function allTripLinkHTML(){
      return '<a href="itinerary.html" class="card allLink"><h2 style="margin-bottom:2px">全部行程</h2><div class="note">点开查看完整行程，当前时段自动高亮 →</div></a>';
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
          html += '<div class="card day' + todayCls + '" data-date="' + day.date + '"><h2>' + stripEmoji(day.title) + '</h2>' + itemsHtml + '</div>';
        }
        if (!beforeTrip && !afterTrip && idx === matchIdx){
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
        labEl.textContent = ended ? "旅途结束，欢迎回家" : "暂无更多安排";
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
      renderReview();
      visaShowIfNeeded();
    }
    whoSel.addEventListener("change", function(){ localStorage.setItem("who", whoSel.value); syncRoleMenu(); visaState = {author:"", items:{}}; renderAll(); loadVisaState(whoSel.value); });
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
        return '<div class="card' + (isToday ? " today" : "") + '"><h2>' + stripEmoji(day.title) + (isToday ? '<span class="tag">今天</span>' : '') + '</h2>' + items + '</div>';
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
    var builderPollTimer = null;
    var pendingAttachment = null;
    var builderAuthorized = false;
    var BUILDER_URL = "https://build.xuzhiyuan1.top";
    var MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

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
        '<div class="princeModal" role="dialog" aria-modal="true" aria-label="小王子·改行程">' +
          '<div class="princeHd">' + EIFFEL + '小王子</div>' +
          '<select class="princeRoleSel" id="princeRoleSel" aria-label="选择角色"></select>' +
          '<div class="princeSub">日程、城市、成员都能直接改；打开网站模式后还能改界面/代码并上传文件。</div>' +
          '<div class="princeChat" id="princeChat" hidden></div>' +
          '<div class="princeAdminRow">' +
            '<label><input type="checkbox" id="princeWebsiteMode"> 网站模式</label>' +
            '<button type="button" class="princeAttachBtn" id="princeAttachBtn">上传文件</button>' +
            '<input type="file" id="princeFile" accept="image/*,.pdf,.txt,.md,.json,.csv" hidden>' +
          '</div>' +
          '<div class="princeFileName" id="princeFileName" hidden></div>' +
          '<div class="princePassRow" id="princePassRow" hidden><input type="password" id="princePass" placeholder="首次使用网站模式请输入管理员口令" autocomplete="off"></div>' +
          '<textarea class="princeTextarea" id="princeText" rows="2" placeholder="想改什么？可改日程、用户、页面或代码"></textarea>' +
          '<button type="button" class="princeSubmit" id="princeSubmit">提交给小王子</button>' +
          '<div class="princeStatus" id="princeStatus"></div>' +
          '<div class="princeDivider"></div>' +
          '<div class="princeFooterRow">' +
            '<button type="button" class="princeHistoryBtn" id="princeHistoryBtn">查看修改记录</button>' +
            '<button type="button" class="princeShareBtn" id="princeShareBtn">查看攻略本</button>' +
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
      var websiteMode = overlay.querySelector("#princeWebsiteMode");
      var attachBtn = overlay.querySelector("#princeAttachBtn");
      var fileInput = overlay.querySelector("#princeFile");
      var fileName = overlay.querySelector("#princeFileName");
      var passRow = overlay.querySelector("#princePassRow");
      var passInput = overlay.querySelector("#princePass");

      passInput.value = localStorage.getItem("builderRoom_pass") || "";
      passInput.addEventListener("input", function(){ localStorage.setItem("builderRoom_pass", passInput.value); });

      function currentDeviceId(){
        var id = localStorage.getItem("deviceId");
        if (!id){ id = "D-" + Math.random().toString(36).slice(2, 8).toUpperCase(); localStorage.setItem("deviceId", id); }
        return id;
      }
      function checkBuilderAuth(){
        return fetch(BUILDER_URL + "/device?device=" + encodeURIComponent(currentDeviceId()))
          .then(function(r){ return r.json(); })
          .then(function(data){ builderAuthorized = !!(data && data.whitelisted); passRow.hidden = builderAuthorized || !websiteMode.checked; })
          .catch(function(){ builderAuthorized = false; passRow.hidden = !websiteMode.checked; });
      }
      websiteMode.addEventListener("change", function(){
        if (websiteMode.checked){ checkBuilderAuth(); }
        else { passRow.hidden = true; }
      });
      attachBtn.addEventListener("click", function(){ fileInput.click(); });
      fileInput.addEventListener("change", function(){
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        if (file.size > MAX_ATTACHMENT_BYTES){ statusEl.className = "princeStatus err"; statusEl.textContent = "文件不能超过 12MB"; return; }
        var reader = new FileReader();
        reader.onload = function(){
          pendingAttachment = { name: file.name, type: file.type || "application/octet-stream", data_b64: reader.result };
          fileName.textContent = file.name + "（点此移除）";
          fileName.hidden = false;
          websiteMode.checked = true;
          checkBuilderAuth();
        };
        reader.onerror = function(){ statusEl.className = "princeStatus err"; statusEl.textContent = "文件读取失败"; };
        reader.readAsDataURL(file);
      });
      fileName.addEventListener("click", function(){ pendingAttachment = null; fileName.hidden = true; fileName.textContent = ""; });

      /* 草稿：文本框内容随打随存到 localStorage，关闭对话框再打开、甚至刷新页面后都还在；
         提交成功后清空（用户手动清空文本框时 input 事件也会把草稿一起清掉）。 */
      textEl.value = localStorage.getItem(DRAFT_KEY) || "";
      textEl.addEventListener("input", function(){ localStorage.setItem(DRAFT_KEY, textEl.value); });

      /* 小王子只能以实际成员身份提交，不能以「总览」身份提交；在这里改 → 把 #who.value 设成新值并
         触发它的 change，让页面原有逻辑（存 localStorage('who') + renderAll）照常跑一遍，整页角色
         （机酒/此刻关注等）跟着变。itinerary 页没有 #who，就直接写 localStorage('who')。
         默认值/与 #who 保持最新一致，由 openModal() 里的 syncRoleSel() 在每次打开时同步。 */
      (USERS.roles || []).forEach(function(n){ roleSel.add(new Option(n, n)); });
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
          statusEl.textContent = "请先选择一个实际成员身份再提交～";
          return;
        }
        if (websiteMode.checked){
          var adminPass = passInput.value.trim();
          if (!builderAuthorized && !adminPass){
            statusEl.className = "princeStatus err";
            statusEl.textContent = "首次使用网站模式需要管理员口令";
            passRow.hidden = false;
            passInput.focus();
            return;
          }
          submitBtn.disabled = true;
          statusEl.className = "princeStatus loading";
          statusEl.textContent = "网站修改任务发送中…";
          postWebsiteEdit(author, text, adminPass, pendingAttachment).then(function(res){
            submitBtn.disabled = false;
            if (res.ok && res.data && res.data.ok){
              builderAuthorized = !!(res.data.whitelisted || res.data.enrolled || builderAuthorized);
              passRow.hidden = builderAuthorized;
              statusEl.className = "princeStatus ok";
              statusEl.textContent = "已发送，正在隔离副本中修改和检查网站…";
              renderChatArea({ text: text, reply: "", status: "处理中", at: new Date().toISOString() });
              textEl.value = "";
              localStorage.removeItem(DRAFT_KEY);
              pendingAttachment = null;
              fileName.hidden = true;
              fileName.textContent = "";
              startWebsitePoll(res.data.id, author, text);
            } else {
              var message = (res.data && res.data.error) || ("提交失败（状态码 " + res.status + "）");
              statusEl.className = "princeStatus err";
              statusEl.textContent = message;
              if (res.status === 401){ builderAuthorized = false; passRow.hidden = false; }
            }
          }).catch(function(err){
            submitBtn.disabled = false;
            statusEl.className = "princeStatus err";
            statusEl.textContent = err && err.name === "AbortError" ? "上传超时，请重试" : "网站修改服务暂时不可用";
          });
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
          historyBtn.textContent = "查看修改记录";
          return;
        }
        historyEl.hidden = false;
        historyBtn.textContent = "收起修改记录";
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

      /* 「查看攻略本」：关闭对话框 + 切到攻略本 tab。index 页有 activateTab（initIndex 里赋值的
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
      /* 键盘弹起判据：可见视口比窗口矮出一截（>140px）即认为键盘把页面顶起了 ——
         此时切到 kb-up 态（对话框填满可见视口、贴键盘上沿），否则回默认态（底部给小王子留位、内容自适应高度） */
      var kbUp = (window.innerHeight - vv.height) > 140;
      overlayEl.classList.toggle("kb-up", kbUp);
      if (kbUp){
        overlayEl.style.top = vv.offsetTop + "px";
        overlayEl.style.height = vv.height + "px";
      } else {
        overlayEl.style.top = "";
        overlayEl.style.height = "";
      }
    }
    /* 每次打开对话框时同步实际成员身份；当前页若是「总览」，就安全回退到默认成员。 */
    function syncRoleSel(){
      if (!overlayEl) return;
      var roleSel = overlayEl.querySelector("#princeRoleSel");
      if (!roleSel) return;
      var whoEl = document.getElementById("who");
      var cur = whoEl ? whoEl.value : (localStorage.getItem("who") || "");
      var members = USERS.roles || [];
      var existing = Array.prototype.map.call(roleSel.options, function(option){ return option.value; });
      if (existing.join("\u0000") !== members.join("\u0000")){
        roleSel.innerHTML = "";
        members.forEach(function(name){ roleSel.add(new Option(name, name)); });
      }
      var selected = members.indexOf(cur) >= 0 ? cur : (USERS.defaultRole || members[0] || "");
      if (selected) roleSel.value = selected;
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
          overlayEl.classList.remove("kb-up"); // 关闭后清掉键盘态，下次打开从默认态开始
        }
      }, 200);
    }

    /* ===== 提交修改：后端立即入队，真实改动在后台完成。 ===== */
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

    function postWebsiteEdit(author, text, pass, attachment){
      var controller = ("AbortController" in window) ? new AbortController() : null;
      var timer = setTimeout(function(){ if (controller) controller.abort(); }, 25000);
      var body = {
        device: localStorage.getItem("deviceId") || "",
        label: author,
        dir: "travel/2610Paris",
        mode: "fullstack",
        text: text
      };
      if (!builderAuthorized && pass) body.pass = pass;
      if (attachment) body.attachment = attachment;
      return fetch(BUILDER_URL + "/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      }).then(function(r){
        clearTimeout(timer);
        return r.json().catch(function(){ return {}; }).then(function(data){ return { status:r.status, ok:r.ok, data:data }; });
      }, function(err){ clearTimeout(timer); throw err; });
    }

    function startWebsitePoll(taskId, author, text){
      if (builderPollTimer) clearInterval(builderPollTimer);
      function check(){
        fetch(BUILDER_URL + "/result?id=" + encodeURIComponent(taskId))
          .then(function(r){ return r.json(); })
          .then(function(result){
            if (!result || !result.status || result.status === "处理中") return;
            clearInterval(builderPollTimer); builderPollTimer = null;
            var statusEl = overlayEl && overlayEl.querySelector("#princeStatus");
            if (result.status === "完成"){
              if (statusEl){ statusEl.className = "princeStatus ok"; statusEl.textContent = "网站修改已完成并通过检查"; }
              renderChatArea({ text:text, reply:result.reply || "网站修改已完成。", status:"完成", at:new Date().toISOString() });
              refreshData();
            } else {
              if (statusEl){ statusEl.className = "princeStatus err"; statusEl.textContent = "网站修改未部署"; }
              renderChatArea({ text:text, reply:result.reply || "网站修改失败。", status:"失败", at:new Date().toISOString() });
            }
          }).catch(function(){ /* 短暂网络问题，下轮继续 */ });
      }
      check();
      builderPollTimer = setInterval(check, 3500);
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

    var PRINCE_WORKS = ["捣蛋中", "烹制中", "思考中", "学习中", "翻找记忆中", "编织回忆中", "施展魔法中", "认真记录中"];
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
        var work = PRINCE_WORKS[Math.floor(Math.random() * PRINCE_WORKS.length)];
        princeContent = '小王子正在<span class="princeWorkWord">' + work + '</span><span class="princeDots"><span></span><span></span><span></span></span>';
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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=7").catch(function(){});
  load().then(function(){
    var page = document.body.getAttribute("data-page");
    if (page === "index") initIndex();
    else if (page === "itin") initItin();
    startDataPolling(); // 每约 30 秒重新拉取当前旅行数据并复用现有渲染函数
  }).catch(function(err){ console.error("数据加载失败", err); });
})();
