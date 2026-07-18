# Recipe · 我的菜谱

个人菜谱网站,部署在 https://xuzhiyuan1.github.io/recipe/

## 站点结构(4 个分类页,详情内联)

```
recipe/
├─ index.html                    # 入口页(4 个分类卡片)
├─ assets/
│  ├─ css/style.css              # 全站样式
│  ├─ js/assistant.js            # 小王子悬浮助手(图标来自曼谷之行)
│  ├─ js/render.js               # 分类页共享渲染器(列表 + 内联展开详情)
│  └─ img/prince.png             # 小王子图标(沿用 2607Bangkok/ui/prince.png)
├─ _data/                        # 菜谱与分类数据(JSON)
│  ├─ categories.json            # 4 个分类
│  ├─ chaocai.json               # 炒菜分类索引(列出菜品 slug)
│  ├─ xican.json                 # 西餐(初始为空数组)
│  ├─ tianpin.json               # 甜品 / 烘焙(初始为空数组)
│  ├─ qita.json                  # 其他(初始为空数组)
│  └─ <拼音-slug>.json           # 每道菜一份
├─ chaocai/index.html            # 4 个分类页都共用同一套结构
├─ xican/index.html
├─ tianpin/index.html
└─ qita/index.html
```

> 不再为每道菜单独建一个子目录。点开分类页里的卡片,菜谱详情直接在当前页展开;
> 助手「📋 总结当前页面」读到的就是刚展开的那道菜。

## 新增一道菜的流程

1. **写数据文件** `_data/<拼音-slug>.json`,参考现有 `qingjiao-chaopaigu.json`:

   ```json
   {
     "id": "my-dish",
     "slug": "my-dish",
     "name": "我的菜",
     "nameEn": "My Dish",
     "category": "chaocai",       // 必须对应一个分类 key
     "emoji": "🍲",
     "difficulty": "简单",
     "time": "约 20 分钟",
     "servings": "2 人份",
     "tags": ["家常", "下饭"],
     "summary": "一句话简介",
     "ingredients": [
       { "name": "鸡蛋", "amount": "2 个" },
       { "name": "葱", "amount": "少许", "highlight": true }
     ],
     "steps": [
       { "title": "热锅", "desc": "...", "tip": "..." }
     ],
     "tips": ["..."]
   }
   ```

   - `highlight: true` 会让食材标签变成金色高亮,适合标记"灵魂食材"(比如啤酒)。

2. **挂到分类索引**:在 `_data/<分类>.json` 的 `recipes` 数组里加上 slug。
   例如炒菜:`_data/chaocai.json` → `recipes: ["qingjiao-chaopaigu", "my-dish"]`。

完成。无需再建 HTML 子页 — 分类页的 `render.js` 会自动拉索引与每道菜 JSON 渲染卡片。

## 小王子悬浮助手 👑

悬浮按钮(用的是 `assets/img/prince.png`,沿用 `2607Bangkok/ui/prince.png` 同款小王子),
提供:

- **📋 总结当前页面** — 读取 `window.__CURRENT_RECIPE__` 生成结构化摘要
  (分类页展开某道菜后,这个变量会被填上)
- **➕ 起草新菜谱** — 输入 `添加:菜名 食材 步骤` 帮你生成 JSON 草稿
- **🍺 / ❓ 关键词问答** — 内置常见问题
- **📷 上传图片** — 优先上传到后端,失败时回退到浏览器本地(base64)

### 接入你自己的后端(可选)

在每个页面的 `</body>` 前加入:

```html
<script>
  window.__RECIPE_CONFIG__ = {
    aiEndpoint:     'https://your-ai.example.com/chat',        // 可选,POST { messages }
    uploadEndpoint: 'https://your-storage.example.com/upload', // 可选,multipart/form-data
    authToken:      'Bearer YOUR_TOKEN'                        // 可选
  };
</script>
```

不配置也能用:关键词问答与图片本地存储都默认工作。

## 数据获取失败排查

`render.js` 在加载失败时会:
- 在控制台打印 `[recipe] 加载失败: <原因>`
- 在页面上渲染一个带诊断提示的空状态(提示检查 `_data/<cat>.json` 是否存在、浏览器是否允许 `fetch`)

最常见原因:
- **GitHub Pages 缓存**:浏览器缓存了旧的 HTML,Ctrl/Cmd-Shift-R 强刷。
- **路径错位**:分类页与首页的相对路径不同,确保 `_data/*.json` 与 `assets/` 都在
  `/recipe/` 根下。
- **本地 file:// 打开**:`fetch` 在 `file://` 协议下会被浏览器拒绝,需要起一个本地
  HTTP 服务(如 `python3 -m http.server`)再访问。

## 设计取向

- 暖色食物风,移动端优先
- 4 个分类页共享顶部导航与底部
- 数据驱动,加新菜只需 JSON(无需新 HTML)
- 图片不上 GitHub,默认走你的后端
