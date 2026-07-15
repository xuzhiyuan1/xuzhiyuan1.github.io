/* 曼谷之旅 · 共享数据（航班 / 逐日行程），index.html 与 itinerary.html 都引用这份 */
var OVERVIEW = "总览";

var PEOPLE = {
  "徐致远": {
    out:{ no:"MU2071", air:"东航", meta:"空客 A320neo · 经济舱", dur:"4时55分", price:"待补充",
          depCity:"北京大兴 PKX", arrCity:"曼谷素万那普 BKK",
          depBJ:"7.31 21:05", depTH:"7.31 20:05", arrBJ:"8.1 02:00", arrTH:"8.1 01:00",
          t:"2026-07-31T21:05:00+08:00" },
    ret:{ no:"MU2072", air:"东航", meta:"空客 A320neo · 经济舱", dur:"5时05分", price:"待补充",
          depCity:"曼谷素万那普 BKK", arrCity:"北京大兴 PKX",
          depBJ:"8.3 03:05", depTH:"8.3 02:05", arrBJ:"8.3 08:10", arrTH:"8.3 07:10",
          t:"2026-08-03T02:05:00+07:00" },
    note:"返程是周日深夜的红眼航班（泰国时间 8.3 凌晨 02:05 起飞）"
  },
  "崔嘉骏": {
    out:{ no:"AQ1267", air:"九元航空", meta:"波音 737 MAX8 · 经济舱", dur:"2时40分", price:"待补充",
          depCity:"广州白云 CAN T2", arrCity:"曼谷素万那普 BKK T1",
          depBJ:"7.31 23:05", depTH:"7.31 22:05", arrBJ:"8.1 01:45", arrTH:"8.1 00:45",
          t:"2026-07-31T23:05:00+08:00" },
    ret:{ no:"9C7420", air:"春秋航空", meta:"空客 A320 · 经济舱", dur:"2时50分", price:"待补充",
          depCity:"曼谷素万那普 BKK", arrCity:"广州白云 CAN T3",
          depBJ:"8.2 22:30", depTH:"8.2 21:30", arrBJ:"8.3 01:20", arrTH:"8.3 00:20",
          t:"2026-08-02T21:30:00+07:00" },
    note:"与唐娅妮、潘骁腾同航班：8.2 周日晚 21:30（泰国时间）从曼谷起飞，8.3 凌晨 01:20 到广州"
  },
  "唐娅妮": {
    out:{ no:"AQ1267", air:"九元航空", meta:"波音 737 MAX8 · 经济舱", dur:"2时40分", price:"待补充",
          depCity:"广州白云 CAN T2", arrCity:"曼谷素万那普 BKK T1",
          depBJ:"7.31 23:05", depTH:"7.31 22:05", arrBJ:"8.1 01:45", arrTH:"8.1 00:45",
          t:"2026-07-31T23:05:00+08:00" },
    ret:{ no:"9C7420", air:"春秋航空", meta:"空客 A320 · 经济舱", dur:"2时50分", price:"待补充",
          depCity:"曼谷素万那普 BKK", arrCity:"广州白云 CAN T3",
          depBJ:"8.2 22:30", depTH:"8.2 21:30", arrBJ:"8.3 01:20", arrTH:"8.3 00:20",
          t:"2026-08-02T21:30:00+07:00" },
    note:"与崔嘉骏、潘骁腾同航班：8.2 周日晚 21:30（泰国时间）从曼谷起飞，8.3 凌晨 01:20 到广州"
  },
  "潘骁腾": {
    out:{ no:"AQ1267", air:"九元航空", meta:"波音 737 MAX8 · 经济舱", dur:"2时40分", price:"¥573",
          depCity:"广州白云 CAN T2", arrCity:"曼谷素万那普 BKK T1",
          depBJ:"7.31 23:05", depTH:"7.31 22:05", arrBJ:"8.1 01:45", arrTH:"8.1 00:45",
          t:"2026-07-31T23:05:00+08:00" },
    ret:{ no:"9C7420", air:"春秋航空", meta:"空客 A320 · 经济舱", dur:"2时50分", price:"¥704",
          depCity:"曼谷素万那普 BKK", arrCity:"广州白云 CAN T3",
          depBJ:"8.2 22:30", depTH:"8.2 21:30", arrBJ:"8.3 01:20", arrTH:"8.3 00:20",
          t:"2026-08-02T21:30:00+07:00" },
    note:"与崔嘉骏、唐娅妮同航班：8.2 周日晚 21:30（泰国时间）从曼谷起飞，8.3 凌晨 01:20 到广州"
  }
};

function mapA(q){ return ' <a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + q + '">🧭 导航</a>'; }
function trackLink(no){ return 'https://www.variflight.com/flight/' + no + '.html'; }
function stripTags(s){ return s.replace(/<[^>]*>/g,"").trim(); }
var DUR = '<img class="dur" src="durian.png" alt="榴莲">';

/* 每个 item 都带 iso（绝对时间戳，用来判断是否已完成）；每个 day 带 loc（当天地点列表，供地图卡使用） */
var ITINERARY = [
  { date:"2026-07-31", label:"Day 0", title:"Day 0 · 7.31 周五 · 出发", loc:[], items:[
    { t:"晚上", iso:"2026-07-31T18:30:00+08:00", b:"各自出发去机场（各人航班不同，看好自己的起飞时间和机场）", n:"护照、充电宝（≤100Wh 随身）、提前填好 TDAC 入境卡；徐致远 21:05 北京大兴 PKX 起飞，崔嘉骏/唐娅妮/潘骁腾 23:05 广州白云 CAN T2 起飞（均为北京时间）" },
    { t:"深夜", iso:"2026-07-31T22:00:00+08:00", b:"飞往曼谷" }
  ]},
  { date:"2026-08-01", label:"Day 1", title:"Day 1 · 8.1 周六 · 曼谷（示例，待确认）",
    loc:["Grand+Palace+Bangkok","Wat+Pho+Bangkok","Wat+Arun+Bangkok","Yaowarat+Road+Bangkok"], items:[
    { t:"凌晨", iso:"2026-08-01T01:00:00+07:00", b:"陆续抵达曼谷素万那普机场 BKK → 前往美居酒店", n:"落地办电话卡 / 换少量现金，打车用 Grab；行程时间均为泰国当地时间" },
    { t:"10:00", iso:"2026-08-01T10:00:00+07:00", b:"大皇宫 + 玉佛寺" + mapA("Grand+Palace+Bangkok"), n:"需长裤/过膝，勿穿背心拖鞋" },
    { t:"13:00", iso:"2026-08-01T13:00:00+07:00", b:"卧佛寺 Wat Pho" + mapA("Wat+Pho+Bangkok") },
    { t:"15:00", iso:"2026-08-01T15:00:00+07:00", b:"湄南河游船 / 郑王庙" + mapA("Wat+Arun+Bangkok") },
    { t:"17:30", iso:"2026-08-01T17:30:00+07:00", b:"唐人街榴莲 " + DUR + " + 夜市晚餐" + mapA("Yaowarat+Road+Bangkok") }
  ]},
  { date:"2026-08-02", label:"Day 2", title:"Day 2 · 8.2 周日 · 返程（示例，待确认）",
    loc:["Chatuchak+Weekend+Market","Or+Tor+Kor+Market+Bangkok"], items:[
    { t:"上午", iso:"2026-08-02T10:00:00+07:00", b:"乍都乍周末市场（周日开）＋ Or Tor Kor 榴莲收尾 " + DUR + mapA("Chatuchak+Weekend+Market") },
    { t:"12:00", iso:"2026-08-02T12:00:00+07:00", b:"退房，行李寄存酒店前台" },
    { t:"深夜", iso:"2026-08-02T22:00:00+07:00", b:"取行李 → 去机场赶航班（各人时间不同，见「机酒」）", n:"崔嘉骏/唐娅妮/潘骁腾 21:30 起飞（泰国时间），徐致远最晚 8.3 凌晨 02:05 起飞（泰国时间）；国际航班建议提前 3 小时到机场" }
  ]}
];

var TRIP_START = ITINERARY[0].items[0].iso;
var TRIP_END = "2026-08-03T12:00:00+08:00";

/* 相对时间文案 */
function relText(ms){
  if (ms <= 0) return "进行中";
  var s = Math.floor(ms/1000);
  var d = Math.floor(s/86400); s %= 86400;
  var h = Math.floor(s/3600); s %= 3600;
  var m = Math.floor(s/60);
  if (d>0) return d+"天"+h+"小时后";
  if (h>0) return h+"小时"+m+"分后";
  if (m>0) return m+"分钟后";
  return "马上";
}

/* 合并"当前未完成的公共行程" + 所选角色的往返航班，按时间排序（此刻关注用） */
function buildUpcoming(roleName){
  var now = Date.now();
  var all = [];
  ITINERARY.forEach(function(day){
    day.items.forEach(function(it){
      if (new Date(it.iso).getTime() > now) all.push({ t: it.iso, label: stripTags(it.b) });
    });
  });
  if (roleName && roleName !== OVERVIEW) {
    var p = PEOPLE[roleName];
    if (p && p.out) all.push({ t: p.out.t, label: "去程 " + p.out.no + " 起飞" });
    if (p && p.ret) all.push({ t: p.ret.t, label: "返程 " + p.ret.no + " 起飞" });
  }
  return all.filter(function(e){ return new Date(e.t).getTime() > now; })
             .sort(function(a,b){ return new Date(a.t) - new Date(b.t); });
}
