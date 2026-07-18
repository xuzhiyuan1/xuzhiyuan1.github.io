# Recipe · 我的菜谱

个人菜谱网站,部署在 https://xuzhiyuan1.github.io/recipe/

## 目录结构

```
recipe/
├─ index.html                    # 入口页(4 个分类卡片)
├─ assets/
│  ├─ css/style.css              # 全站样式
│  └─ js/assistant.js            # 小王子悬浮助手
├─ _data/                        # 菜谱与分类数据(JSON)
│  ├─ categories.json            # 4 个分类
│  ├─ chaocai.json               # 炒菜分类索引(列出菜品 slug)
│  ├─ qingjiao-chaopaigu.json    # 第一道菜
│  └─ ...
├─ chaocai/                      # 炒菜分类
│  ├─ index.html
│  └─ qingjiao-chaopaigu/
│     └─ index.html              # 菜品详情页(从 JSON 渲染)
├─ xican/                        # 西餐(占位)
├─ tianpin/                      # 甜品 / 烘焙(占位)
└─ qita/                         # 其他(占位)
```

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
       { "title": "热锅", "desc": "..." , "tip": "..." }
     ],
     "tips": ["..."]
   }
   ```

   - `highlight: true` 会让食材标签变成金色高亮,适合标记"灵魂食材"(比如啤酒)。

2. **挂到分类索引**:在 `_data/<分类>.json` 的 `recipes` 数组里加上 slug。
   例如炒菜:`_data/chaocai.json` → `recipes: ["qingjiao-chaopaigu", "my-dish"]`。

3. **建详情页目录**:在对应分类目录下新建 `<slug>/index.html`。
   模板可直接复用 `chaocai/qingjiao-chaopaigu/index.html`,只改一行:
   ```js
   data = await fetch('../../_data/<slug>.json').then(...)
   ```

## 小王子悬浮助手 👑

右下角的悬浮按钮,提供:

- **📋 总结当前页面** — 读取 `window.__CURRENT_RECIPE__` 生成结构化摘要
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

### AI 后端协议(参考)

```
POST {aiEndpoint}
Content-Type: application/json
Body: { "messages": [{role,content}, ...], "system": "..." }
→ 返回 { "reply": "..." }  (或 answer / message / 任意字符串字段)
```

### 图片上传协议(参考)

```
POST {uploadEndpoint}  multipart/form-data, field "file"
→ 返回 { "url": "https://..." }
```

## 设计取向

- 暖色食物风,移动端优先
- 所有页面共享顶部导航与底部
- 数据驱动,加新菜只需 JSON + 一个新目录
- 图片不上 GitHub,默认走你的后端
