/* =========================================================
   Destinations data — edit me!
   schema:
     { city, country, year?, note?, priority?, link? }
   - 已去过的: 提供 year(年份)
   - 想去的:   提供 priority ("高" / "中" / "低",可选)
   ========================================================= */

window.DESTINATIONS = {
    visited: [
        {
            city: "北京",
            country: "中国",
            year: 2014,
            note: "故乡,从这里出发。",
        },
        {
            city: "上海",
            country: "中国",
            year: 2017,
            note: "外滩的风。",
        },
        {
            city: "曼谷",
            country: "Thailand",
            year: 2026,
            note: "2026 盛夏。",
            link: "../2607Bangkok/"
        },
    ],
    wishlist: [
        {
            city: "京都",
            country: "日本",
            priority: "高",
            note: "想在樱花季走一次哲学之道。",
        },
        {
            city: "Reykjavík",
            country: "Iceland",
            priority: "高",
            note: "极光。",
        },
        {
            city: "Lisbon",
            country: "Portugal",
            priority: "中",
            note: "电车、黄房子、蛋挞。",
        },
        {
            city: "Patagonia",
            country: "Chile / Argentina",
            priority: "中",
            note: "百内国家公园。",
        },
        {
            city: "Marrakech",
            country: "Morocco",
            priority: "低",
            note: "麦地那的烟火气。",
        },
    ],
};
