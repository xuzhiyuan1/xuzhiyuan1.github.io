# 2610Brussels 与后端的关系（前端视角）

本目录（`travel/2610Brussels/`）的前端会优先去 `CONFIG.BACKEND_URL`（= `https://trip.xuzhiyuan1.top`）
拉数据；这个域名在 cloudflared 里现在只指向曼谷后端（`backend/travel/2607Bangkok/server.py`，
端口 8787），所以直接调 `/data` 拿回的是曼谷数据。

`ui/app.js` 在拿到后端响应后做一次 **trip-guard**——把响应整体 JSON 化，看是否包含
`CONFIG.EXPECTED_TRIP_KEYWORDS`（"布鲁塞尔"/"Brussels"）任一关键字。只要没命中，就视为"不是
本次行程的后端"，抛错走仓库静态 JSON 兜底；`/history`、`/exchange` 同理；`/edit` 走客户端动态后端。
这样做的两点好处：

1. 现在 Cloudflare Tunnel 后面没有布鲁塞尔兄弟后端进程也不会把曼谷数据塞进布鲁塞尔页面。
2. 以后真去 `backend/travel/` 下加一个 `2610Brussels/server.py`、分配独立端口 + 加一条
   cloudflared ingress，本目录前端**自动**切换到实时后端，不需要再改前端。

## 客户端动态后端（当前生效，真后端没接时的兜底）

trip-guard 没通过时（`CONFIG.BACKEND_OK === false`），所有写入型接口不再拒收，而是落到
localStorage 上模拟一个"动态后端"，让小白对话框 / 修改记录 / 攻略本立刻能用：

| 接口 | 客户端动态实现 |
|------|-----------------|
| `POST /edit` | 入 `brussels_local_history`（含 version=ls<ts>），给角色写一条 `status="处理中"` 的回执；1.6s 后按关键词挑一句回复，回执+历史同步更新为 `status="完成"` |
| `GET /history` | 仓库 `data/history.json` + 本地 `brussels_local_history` 按 version 去重合并 |
| `GET /exchange?author=...` | 直接读 `brussels_local_exchange[角色]`，节奏与真后端一致 |
| 攻略本追加 | 客户端按"问 / 攻略"型文本自动归集到 `brussels_local_guidebook`，回执就位后写 `a` 字段；首页 `loadFromRepo()` 加载时合并 |
| 多 tab 同步 | BroadcastChannel("brussels_local_backend")，`history` / `guidebook` / `exchange` 频道联动，其它 tab 收到广播就 `refreshData()` |

`useLocalBackend()` 一行函数统一判断：`!CONFIG.BACKEND_OK` → 本地兜底；以后真把
2610Brussels 后端接上后，`BACKEND_OK` 会变 true，所有入口自动切走，前端逻辑零改动。

## 部署一个 2610Brussels 后端（用户后续手动操作，不在本前端修改权限内）

参考 `backend/travel/2607Bangkok/HANDOFF.md` **加一个新页面** 一节 + 同目录的
`ARCHITECTURE.md`：

1. 建目录：`mkdir -p ~/website/backend/travel/2610Brussels/state`
2. 拷一份 `backend/travel/2607Bangkok/server.py` 为 `2610Brussels/server.py`，把里面的
   `BASE/STATE/FILES` 改到 `2610Brussels`，并把"曼谷 / 泰国 / 大兴 / MU2071 ..."这类硬编码 prompt
   改成"布鲁塞尔 / 比利时 / 首都 PEK / HU491 ..."等本次行程的字段。
3. 选一个新端口（避开 8787–8793），如 `8794`。
4. 写一份 systemd --user service（仿 `~/.config/systemd/user/website-travel-2607bangkok.service`），
   `ExecStart=/usr/bin/python3 /home/xuzy/website/backend/travel/2610Brussels/server.py`，
   启动后 `curl http://127.0.0.1:8794/ping` 应返回 `{"ok":true}`。
5. cloudflared `config.yml` 加一条 ingress，例如：
   ```yaml
     - hostname: trip.xuzhiyuan1.top
       path: ^/2610Brussels/.*
       service: http://localhost:8794
   ```
   放在现在 `trip.xuzhiyuan1.top → :8787` 之上（更具体规则优先）。
6. `systemctl --user restart website-tunnel.service`，外网
   `curl https://trip.xuzhiyuan1.top/2610Brussels/data` 应返回布鲁塞尔 bundle。
7. 把本目录 `data/*.json` 拷到 `backend/travel/2610Brussels/state/`（`guidebook.json`
   `history.json` 也带上），这样小白 / 修改记录 / 攻略本立刻就能用。

到这一步后，本目录前端无需任何改动——`/data` 返回的 brandTitle 含"布鲁塞尔"，trip-guard
放行；`/history / /exchange / /edit` 自动从本地兜底切到真后端。客户端 localStorage 里之前累积
的本地记录/攻略可以在迁移脚本里导出再合并到 `state/*.json`（用户后续自行处理）。

## 当前行为（兄弟后端还没接）

- `/data` 命中 trip-guard → 抛错 → 回退到 `data/*.json`（已经是布鲁塞尔内容）。
- `data/guidebook.json` 也加入 sw.js 缓存与回退集合，攻略本离线也能看。
- `DEFAULT_REVIEW` 修成了和 trip.json 一致的"10 天 3 国 · 布鲁塞尔→巴黎→阿姆斯特丹"措辞，
  以前的"六天五晚 / 单国"残值清掉了。
- 小白对话面板点提交：本地动态后端模式（参见上文）——写入 localStorage + 异步吐完成回执。
- 角色从「小王子」改为「线条小狗·小白」（`ui/dog.svg`），所有面向用户的文案同步更新，
  内部 CSS 类名（`.princeFab` / `.princeModal` 等）保持不变，避免侵入式重命名。