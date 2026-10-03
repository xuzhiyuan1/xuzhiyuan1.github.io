# 2610Paris 后端契约

2610Paris 页面读取和写入真实的、共享的旅行状态：

```text
静态页面： https://xuzhiyuan1.github.io/travel/2610Paris/
动态 API： https://trip.xuzhiyuan1.top/2610Paris/
后端状态： ~/website/backend/travel/2610Paris/state/
服务：     website-travel-2610paris.service (127.0.0.1:8794)
```

页面把 API 根地址写在 `ui/app.js` 的 `CONFIG.BACKEND_URL`。共享旅行服务提供：

- `GET /data`：当前旅行 bundle 与攻略本；
- `GET /history`：最近修改记录；
- `GET /exchange?author=...`：某角色最后一条小王子回复；
- `POST /edit`：异步交给小王子整理，随后更新以上状态；
- `GET /ping`：服务及路径核验。

仓库中的 `data/*.json` 只作为网络不可用时的静态兜底；当前不会定时发布服务器状态到
GitHub。不会再用 `localStorage` 模拟后端，因此所有设备看到的是同一份实时记录。

`ui/app.js` 保留 trip guard：只有包含“2610Paris / 巴黎 / Paris”标识的 bundle 才会渲染，
防止 Tunnel 配置错误时串入其它旅行的数据。小王子使用本旅行目录内的 DeepSeek 配置处理
结构化旅行状态；网站模式则由 Builder 在隔离副本中修改页面与后端代码。

`preview/index.html` 与最新本地完整行程保持一致；`trip.json` 的逐日活动、说明和账单
来自同一份行程，更新时需同时同步真实后端状态与仓库兜底。活动时间包含明确时区偏移，
欧洲日期按 `Europe/Paris` 判断。仅有“晚上”等描述或已标注冲突待核的项目保留为
参考，`iso` 为 `null`，不进入“下一个日程”倒计时；不推测音乐会散场时间。
