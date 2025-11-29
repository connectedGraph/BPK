# 🎮 BrigthlyPk在线自定义题库的巅峰积分制答题Pk游戏

一个基于 WebSocket 的实时对战答题平台，支持数学题目对战、好友系统和实时聊天功能。
## ✨ 特色功能

### 🎯 核心对战
- **实时匹配系统** - 根据难度自动匹配对手
- **多难度选择** - 简单、中等、困难三种难度
- **实时对战** - WebSocket 驱动的实时答题对战
- **智能计分** - 根据答题速度和正确率动态计分
- **错题记录** - 自动记录错题，支持导出为 Markdown

### 👥 社交系统
- **好友系统** - 添加好友、管理好友关系
- **实时聊天** - 与好友进行实时消息交流
- **对战邀请** - 通过好友系统发起对战邀请
- **战绩展示** - 查看好友积分和胜率

### 📊 数据统计
- **个人战绩** - 积分、胜场、败场统计
- **答题分析** - 正确率、答题速度分析
- **错题回顾** - 详细的错题解析和统计

## 🚀 快速开始

### 环境要求
- Node.js 18+
- 现代浏览器（支持 WebSocket）

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd realtime-quiz-battle
```

2. **安装依赖**
```bash
npm install express ws uuid body-parser express-session cors
```

3. **启动服务器**
```bash
node server.js
```

4. **访问应用**
```
打开浏览器访问 http://localhost:3000
```

## 🏗️ 项目结构

```
realtime-quiz-battle/
├── server.js                 # 后端服务器主文件
├── data/                     # 数据存储目录
│   ├── users.json           # 用户数据
│   ├── questions.json       # 题目数据
│   ├── battles.json         # 对战记录
│   ├── errorBank.json       # 错题本数据
│   ├── friendRequests.json  # 好友申请
│   ├── friendships.json     # 好友关系
│   └── chatMessages.json    # 聊天记录
└── README.md
```

## 🎮 使用指南

### 用户注册登录
1. 首次使用需要注册账号
2. 用户名需 3-16 位，密码需 6-20 位
3. 注册成功后自动分配用户 ID

### 开始对战
1. 选择对战难度（简单/中等/困难）
2. 点击"发起匹配"进入匹配队列
3. 系统自动匹配实力相当的对手
4. 匹配成功后开始实时答题对战

### 答题规则
- 每场对战包含 5 道题目
- 每题限时 30 秒
- 根据答题速度和正确率计算得分
- 超时未答视为错误

### 好友系统
1. **添加好友** - 通过用户名搜索添加好友
2. **处理申请** - 在好友页面查看和处理好友申请
3. **实时聊天** - 与在线好友进行实时对话
4. **战绩查看** - 查看好友的积分和胜率

### 错题本
1. **自动记录** - 答错的题目自动加入错题本
2. **分类查看** - 按难度和题型分类查看
3. **导出功能** - 支持导出为 Markdown 格式
4. **统计分析** - 查看错题统计和学习进度

## 🔧 API 文档

### 用户相关
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `GET /api/user` - 获取用户信息

### 对战相关
- `GET /api/battles/:id` - 获取对战详情
- `GET /api/user/battle-stats` - 获取用户对战统计
- `GET /api/battles/:id/stats` - 获取对战答题统计

### 题目相关
- `GET /api/questions` - 获取题目列表

### 错题本相关
- `GET /api/error-bank` - 获取错题本
- `GET /api/error-bank/export` - 导出错题本
- `DELETE /api/error-bank/clear` - 清空错题本

### 好友相关
- `GET /api/users` - 获取用户列表
- `POST /api/friend-request` - 发送好友申请
- `GET /api/friend-requests` - 获取好友申请列表
- `POST /api/friend-request/respond` - 处理好友申请
- `GET /api/friends` - 获取好友列表
- `GET /api/chat/:friendId` - 获取聊天记录

## 🌐 WebSocket 协议

### 消息类型
- `auth` - 用户认证
- `match_join` - 加入匹配
- `match_cancel` - 取消匹配
- `battle_ready` - 对战准备
- `answer_progress` - 答题进度
- `chat_message` - 聊天消息

### 事件类型
- `match_status` - 匹配状态更新
- `match_found` - 匹配成功
- `battle_start` - 对战开始
- `battle_update` - 对战进度更新
- `battle_end` - 对战结束
- `friend_request_received` - 收到好友申请
- `friend_request_accepted` - 好友申请被接受
- `chat_message` - 收到聊天消息

## 🎯 技术架构

### 前端技术
- **原生 HTML/CSS/JavaScript** - 轻量级前端，无框架依赖
- **MathJax** - 数学公式渲染
- **WebSocket** - 实时通信
- **Axios** - HTTP 请求库

### 后端技术
- **Express.js** - Web 服务器框架
- **WebSocket** - 实时通信协议
- **Session** - 用户会话管理
- **文件存储** - JSON 文件作为数据库

### 核心特性
- **实时同步** - 对战状态实时同步
- **自动持久化** - 数据自动保存到文件
- **错误恢复** - WebSocket 断线重连
- **性能优化** - 内存缓存减少 IO 操作

## 📋 更新计划

### 🚀 近期更新
- ✅ 成功部署项目到云服务器
- ✅ 完全修复对局相关 bug
- ✅ 新增多选题逻辑支持
- ✅ 优化聊天功能，发送消息后实时显示
- ✅ 修改导航栏布局到底部

### 🔧 待修复问题
- **题目显示问题**：投影向量题目 4D 选项 LaTeX 渲染异常
- **随机性改进**：题目分配仍为伪随机，每次部署/登录题目顺序相同
- **多选题支持**：题库中未添加多选题，对局中不展示多选题
- **错题本显示**：错题本中选择题无选项显示问题
- **对局结算**：一方逃跑时对局结算和积分扣除机制需要完善
- **新用户注册**：新人注册时导航栏显示异常问题

### 🎯 功能规划
- **题目管理后台**：开发后台 HTML 界面实现题目的添加、编辑、删除
- **UI/UX 优化**：优化导航栏功能层级，改善用户体验
- **用户系统增强**：
  - 支持密码修改、邮箱修改、个性签名等个人资料管理
  - 查看他人主页，包括胜率、作战记录
  - 个人资料页面优化
- **排行榜系统**：设置积分排行榜、胜率榜、做题活跃榜等
- **B2B 功能**：开放特定题库支持，为不同客户提供定制化题目集

### ⚠️ 题目管理注意事项
1. **题目插入方式**：目前需要直接修改 JSON 文件，较为不便
2. **JSON 格式规范**：
   - 所有单斜线表示的公式必须改为双斜线（JSON 转义）
   - 题目难度分配：
     - 简单（easy）：题号 1-3, 12
     - 中等（medium）：题号 4-6, 13  
     - 困难（hard）：题号 7-8, 14
   - 数学符号规范：大于小于号不能使用 "<>"，必须使用 LaTeX 公式 "\lt", "\gt"（斜线需要双斜线转义）
   - 填空题格式：option 为空数组，type 为 "fill"

**示例题目格式：**
```json
{
  "id": "q15",
  "difficulty": "hard",
  "type": "choice",
  "title": "双曲线的离心率",
  "content": "已知\\(F\\)是双曲线\\(\\dfrac{x^2}{a^2}-\\dfrac{y^2}{b^2}=1(a>0,b>0)\\)的右焦点，过点\\(F\\)作垂直于\\(x\\)轴的直线与双曲线交于\\(P\\)，\\(Q\\)两点，\\(A_1,A_2\\)分别为双曲线的左、右顶点，连接\\(A_1P\\)交\\(y\\)轴于点\\(B\\)，连接\\(BA_2\\)并延长交\\(PQ\\)于点\\(C\\)，且\\(3\\overrightarrow{FC}=\\overrightarrow{FQ}\\)，则双曲线的离心率为",
  "options": ["2", "\\(\\dfrac{5}{3}\\)", "3", "\\(\\dfrac{5}{2}\\)"],
  "answer": "A",
  "analysis": "由题意得\\(P\\left(c,\\dfrac{b^2}{a}\\right),Q\\left(c,-\\dfrac{b^2}{a}\\right)\\)，\\(A_1(-a,0)\\)，直线\\(PA_1\\)方程为\\(y=\\dfrac{b^2}{a(c+a)}(x+a)\\)，令\\(x=0\\)得\\(B\\left(0,\\dfrac{b^2}{c+a}\\right)\\)，直线\\(BA_2\\)方程为\\(y=-\\dfrac{b^2}{a(c+a)}(x-a)\\)，令\\(x=c\\)得\\(y_C=-\\dfrac{b^2(c-a)}{a(c+a)}\\)。由\\(3\\overrightarrow{FC}=\\overrightarrow{FQ}\\)得\\(3\\times\\left(-\\dfrac{b^2(c-a)}{a(c+a)}\\right)=-\\dfrac{b^2}{a}\\)，整理得\\(2c=4a\\)，所以离心率\\(e=\\dfrac{c}{a}=2\\)"
}
```

### 👥 测试与实验
- **目标用户**：面向需要开放特定题库的 B 端客户
- **功能封装**：为不同客户群体提供定制化的题目集和功能模块

## 🔒 数据模型

### 用户模型
```javascript
{
  id: "user-uuid",
  username: "用户名",
  password: "密码哈希",
  email: "邮箱",
  score: 1000,        // 积分
  wins: 0,            // 胜场
  losses: 0,          // 败场
  createdAt: "时间戳"
}
```

### 对战模型
```javascript
{
  id: "battle-uuid",
  difficulty: "easy|medium|hard",
  state: "waiting|playing|finished",
  players: [/* 玩家数组 */],
  questions: [/* 题目数组 */],
  startTime: "时间戳",
  endTime: "时间戳",
  result: {/* 对战结果 */}
}
```

## 🛠️ 开发指南

### 添加新题目
在 `server.js` 的 `questions` 数组中添加新题目：

```javascript
{
  id: 'q-unique-id',
  type: 'single', // single: 单选, fill: 填空
  difficulty: 'easy|medium|hard',
  content: '题目内容，支持 LaTeX 公式：$E=mc^2$',
  options: ['选项A', '选项B', '选项C', '选项D'], // 单选题目需要
  answer: 'A', // 正确答案
  analysis: '题目解析'
}
```

### 自定义难度
修改 `getRandomQuestions` 函数中的题目数量：
```javascript
function getRandomQuestions(difficulty, count = 5) {
  // 返回指定难度的题目
}
```

### 扩展功能
1. **题目类型** - 支持多选题、判断题等
2. **排行榜** - 添加全球排行榜
3. **房间系统** - 支持创建私人房间
4. **成就系统** - 添加成就和徽章

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🎉 致谢

- [Express.js](https://expressjs.com/) - Web 框架
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) - 实时通信
- [MathJax](https://www.mathjax.org/) - 数学公式渲染
- [Axios](https://axios-http.com/) - HTTP 客户端

---

**开始你的答题对战之旅吧！** 🚀