# 2610Brussels 后端契约

布鲁塞尔页面读取和写入真实的、共享的旅行状态：

```text
静态页面： https://xuzhiyuan1.github.io/travel/2610Brussels/
动态 API： https://trip.xuzhiyuan1.top/2610Brussels/
后端状态： ~/website/backend/travel/2610Brussels/state/
服务：     website-travel-2610brussels.service (127.0.0.1:8794)
```

页面把 API 根地址写在 `ui/app.js` 的 `CONFIG.BACKEND_URL`。共享旅行服务提供：

- `GET /data`：当前旅行 bundle 与攻略本；
- `GET /history`：最近修改记录；
- `GET /exchange?author=...`：某角色最后一条小白回复；
- `POST /edit`：异步交给小白整理，随后更新以上状态；
- `GET /ping`：服务及路径核验。

仓库中的 `data/*.json` 只作为网络不可用时的静态兜底。它们由
`backend/travel/sync_static.py` 导出，再由统一的 Pages 发布脚本提交；不会再用
`localStorage` 模拟后端，因此所有设备看到的是同一份记录。

`ui/app.js` 保留 trip guard：只有包含“布鲁塞尔/Brussels”标识的 bundle 才会渲染，防止 Tunnel
配置错误时串入其它旅行的数据。小白的模型调用无工具权限，只能基于本次旅行状态返回结构化结果。
