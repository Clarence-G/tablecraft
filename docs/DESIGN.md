# DESIGN.md -- Web 桌游大全

## 1. 视觉主题与氛围

桌游大全的设计语言是 "数字桌面上的实体游戏"。整个界面模拟一张温暖的木质桌面，UI 元素像真实的卡牌、棋子、骰子散落其上。设计核心是 **厚边框、重阴影、3D 拟物** -- 每一个组件都要有"拿得起来"的物理存在感。

画布底色是暖奶油色 (#faf5eb)，模拟浅色桌布/木桌；卡片用纯白 #ffffff，模拟实体卡牌的纸质感；边框统一 2-3px 实线，颜色为深棕 (#3d2e1e)，模拟卡牌黑色描边。

所有交互都带有物理隐喻：悬浮时卡片"抬起"并加深阴影，点击时卡片"压下"并缩小阴影，页面切换有翻牌感。

核心特征：
- 暖奶油画布 (#faf5eb) -- 模拟桌布/浅色木桌
- 深棕厚边框 (2-3px solid #3d2e1e) -- 模拟卡牌描边
- 硬偏移阴影 (#3d2e1e -6px 6px 0px) -- 拟物投影，像棋子在桌上的影子
- 多层阴影系统：底层软阴影 + 顶层硬阴影 = 3D 浮起感
- 六色游戏色板：骰红、宝蓝、翡翠、琥珀、皇紫、珊瑚 -- 像一盒桌游里的彩色配件
- 大圆角 (16-24px) -- 圆润的卡牌边缘
- 悬浮微旋转 (rotate(-2deg)) -- 像手拿起一张牌时的自然倾斜
- 可选纹理叠加：background-image 叠加亚麻/木纹纹理增强触觉感

---

## 2. 色彩系统

### 桌面底色

- 桌布奶油 #faf5eb -- 页面背景、主画布
- 桌布深 #f0e8d8 -- 次级区域背景、sidebar
- 卡牌白 #ffffff -- 卡片/弹窗/输入框背景

### 墨色系 (文字 & 边框)

- 墨棕 #3d2e1e -- 一级标题、厚边框、硬阴影色
- 深墨 #1a1108 -- 最高强调 (logo、大标题)
- 中棕 #6b5744 -- 二级文字、说明文字
- 浅棕 #9c8b78 -- 三级文字、占位符
- 极浅棕 #c4b8a8 -- 禁用态、分割线

### 六色游戏色板

| 名称 | 主色 | 浅色 (背景) | 深色 (文字) | 隐喻 |
|------|------|-------------|-------------|------|
| 骰红 Dice Red | #d94040 | #fde8e8 | #7a1a1a | 经典红色骰子 |
| 宝蓝 Royal Blue | #2563eb | #e8f0fe | #1a3a8a | 棋盘色、策略类 |
| 翡翠 Jade Green | #16a34a | #e8f8ee | #0a5c2a | 棋子、自然/冒险类 |
| 琥珀 Amber Gold | #d97706 | #fef3e0 | #7a4006 | 金币、奖杯、经济类 |
| 皇紫 Crown Purple | #7c3aed | #f0e8fe | #4a1a8a | 魔法、奇幻类 |
| 珊瑚 Coral Pink | #e8556d | #fde8ec | #8a1a30 | 派对、社交类 |

### 语义色

- 成功 #16a34a (翡翠) -- 在线、可用、评分高
- 警告 #d97706 (琥珀) -- 库存少、注意
- 错误 #d94040 (骰红) -- 错误、缺货
- 信息 #2563eb (宝蓝) -- 提示、新内容

### 阴影色

- 硬阴影 #3d2e1e -- 不透明、用于偏移阴影
- 软阴影 rgba(61, 46, 30, 0.15) -- 用于柔和投影层
- 内阴影 rgba(61, 46, 30, 0.08) -- 用于 inset 凹陷效果

---

## 3. 排版规则

### 字体

| 角色 | 字体 | 备注 |
|------|------|------|
| 展示/标题 | "Noto Sans SC", system-ui | 几何感强，像桌游包装盒上的字 |
| 正文/UI | "Noto Sans SC", "Inter", system-ui | 清晰可读的中文 + 西文 |
| 等宽/标签 | "Space Mono", "JetBrains Mono", monospace | 游戏编号、规则参数 |

### 字号层级

| 角色 | 字号 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| 超大展示 | 64px | 700 | 1.05 | -2px | 首页 Hero 标语 |
| 页面标题 | 40px | 700 | 1.10 | -1.2px | 分类页标题 |
| 区块标题 | 28px | 600 | 1.15 | -0.56px | 模块/区域标题 |
| 卡牌标题 | 20px | 600 | 1.25 | -0.3px | 游戏名称 |
| 副标题 | 16px | 500 | 1.40 | normal | 游戏标签/简述 |
| 正文 | 16px | 400 | 1.60 | normal | 游戏介绍/规则 |
| 小字 | 14px | 400 | 1.50 | normal | 元数据、时间 |
| 标签 (大写) | 12px | 600 | 1.20 | 1.5px | text-transform: uppercase，分类标签 |

### 原则

- 标题字重 600-700，像桌游包装盒上粗壮的字
- 正文绝不超过 500，保持阅读舒适
- 中文标题可用 700，西文标题用 600 即够

---

## 4. 组件样式

### 按钮

**主按钮 (Primary)**
```
background: #3d2e1e
color: #ffffff
border: 2px solid #1a1108
border-radius: 12px
padding: 10px 24px
box-shadow: #1a1108 -4px 4px 0px
font-weight: 600

hover: transform: translateY(-2px); box-shadow: #1a1108 -5px 6px 0px
active: transform: translateY(1px); box-shadow: #1a1108 -2px 2px 0px
```

**次按钮 (Secondary)**
```
background: #ffffff
color: #3d2e1e
border: 2px solid #3d2e1e
border-radius: 12px
padding: 10px 24px
box-shadow: #3d2e1e -4px 4px 0px

hover: background: #faf5eb; transform: translateY(-2px); box-shadow: #3d2e1e -5px 6px 0px
active: transform: translateY(1px); box-shadow: #3d2e1e -2px 2px 0px
```

### 卡片 -- 核心组件，模拟实体卡牌

```
background: #ffffff
border: 2.5px solid #3d2e1e
border-radius: 16px
box-shadow: #3d2e1e -6px 6px 0px, rgba(61,46,30,0.08) 0px 2px 8px
overflow: hidden

hover:
  transform: translateY(-4px) rotate(-1.5deg)
  box-shadow: #3d2e1e -8px 10px 0px, rgba(61,46,30,0.12) 0px 8px 24px
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)

active:
  transform: translateY(0px) rotate(0deg)
  box-shadow: #3d2e1e -3px 3px 0px, rgba(61,46,30,0.06) 0px 1px 4px
```

### 输入框

```
background: #ffffff
color: #3d2e1e
border: 2px solid #c4b8a8
border-radius: 12px
padding: 10px 14px
box-shadow: inset rgba(61,46,30,0.06) 0px 2px 4px

focus:
  border-color: #3d2e1e
  box-shadow: inset rgba(61,46,30,0.06) 0px 2px 4px, rgba(61,46,30,0.12) 0px 0px 0px 3px
```

### 标签/徽章

**分类标签 (彩色药丸)**
```
background: {游戏色板浅色}
color: {游戏色板深色}
border: 1.5px solid {游戏色板主色}
border-radius: 999px
padding: 4px 12px
font-size: 12px; font-weight: 600
```

---

## 5. 布局原则

### 间距系统

- 基础单位: 8px
- 常用: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
- 卡片内边距: 16-20px
- 卡片间距: 24px
- 区块间距: 48-80px

### 圆角系统

| 层级 | 圆角 | 用途 |
|------|------|------|
| 小 | 8px | 骰子形徽章、小参数块 |
| 中 | 12px | 按钮、输入框、小卡片 |
| 大 | 16px | 标准游戏卡、弹窗 |
| 超大 | 24px | Hero 区块、大面板 |
| 药丸 | 999px | 分类标签、搜索框 |

---

## 6. 深度与层级 -- 拟物核心

| 层级 | 处理方式 | 用途 |
|------|----------|------|
| 凹陷 (L-1) | inset rgba(61,46,30,0.08) 0px 2px 4px | 输入框、搜索框 |
| 桌面 (L0) | 无阴影，奶油色底 #faf5eb | 页面背景 |
| 铺垫 (L1) | rgba(61,46,30,0.06) 0px 1px 3px | 信息块、参数卡 |
| 卡牌 (L2) | #3d2e1e -6px 6px 0px + 柔软层 | 游戏卡片 |
| 抬起 (L3) | #3d2e1e -8px 10px 0px + 柔散层 | 卡片 hover |
| 弹窗 (L4) | rgba(61,46,30,0.25) 0px 16px 48px | Modal、下拉菜单 |

---

## 7. 响应式行为

| 名称 | 宽度 | 关键变化 |
|------|------|----------|
| 小屏手机 | <480px | 单列卡片，缩小阴影 (-4px 4px)，侧边距 16px |
| 手机 | 480-767px | 双列卡片网格 |
| 平板 | 768-1023px | 三列卡片，导航精简 |
| 桌面 | 1024-1279px | 四列卡片，完整布局 |
| 大屏 | 1280px+ | 最大宽度 1200px 居中，两侧大留白 |

触控适配：
- 按钮最小触控区: 44x44px
- 移动端阴影适当缩小 (-4px 4px 代替 -6px 6px)
- 卡片间距移动端缩小到 16px

---

## 8. Do's & Don'ts

### Do
- 所有卡片使用 2-3px 实线深棕边框 + 硬偏移阴影
- 使用暖奶油色 (#faf5eb) 作为页面背景
- 悬浮时加微旋转 (rotate(-1~-2deg)) 模拟拿起卡牌的手感
- 按钮必须有硬阴影并响应 hover/active 的"浮起/压下"动画
- 徽章/标签用药丸形 (999px) 搭配色板浅底 + 实线细边框
- 评分/数字参数用等宽字体 (Space Mono)

### Don't
- 不要用无边框卡片
- 不要用柔和/模糊阴影做主阴影 -- 硬偏移阴影才是拟物
- 不要用冷灰色 (#ccc, #eee) -- 所有中性色必须偏暖 (棕色调)
- 不要让卡片悬浮时静止不动 -- 必须有位移 + 阴影变化
- 不要用纯黑文字 #000000 -- 用深墨 #1a1108 或墨棕 #3d2e1e
- 不要在正文中用 700 字重 -- 粗壮字体只属于标题和按钮
