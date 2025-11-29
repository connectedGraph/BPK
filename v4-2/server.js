const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const {
    v4: uuidv4
} = require('uuid');
const os = require('os');

// ===============================
// 服务器初始化配置
// ===============================

// 初始化Express应用和HTTP服务器
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
    server
});

// 服务器配置参数
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// 数据文件路径配置
const DATA_DIR = path.join(__dirname, 'data');
const USER_DATA_PATH = path.join(DATA_DIR, 'users.json');
const BATTLE_DATA_PATH = path.join(DATA_DIR, 'battles.json');
const QUESTION_DATA_PATH = path.join(DATA_DIR, 'questions.json');
const ERROR_BANK_PATH = path.join(DATA_DIR, 'errorBank.json');
const FRIEND_REQUESTS_PATH = path.join(DATA_DIR, 'friendRequests.json');
const FRIENDSHIPS_PATH = path.join(DATA_DIR, 'friendships.json');
const CHAT_MESSAGES_PATH = path.join(DATA_DIR, 'chatMessages.json');
const FAVORITE_QUESTIONS_PATH = path.join(DATA_DIR, 'favoriteQuestions.json');
const SENSITIVE_WORDS_PATH = path.join(DATA_DIR, 'sw.txt'); // 新增违禁词文件路径

// ===============================
// 游戏配置参数
// ===============================

// 信誉分系统配置
const CREDIT_CONFIG = {
    MAX_CREDIT: 100, // 最高信誉分
    MIN_CREDIT_FOR_BATTLE: 95, // 最低对战信誉分
    DAILY_RECOVERY: 5, // 每日恢复上限
    ESCAPE_PENALTY: 3, // 逃跑扣分
    NEGATIVE_PENALTY: 2, // 消极比赛扣分
    NORMAL_REWARD: 1, // 正常比赛加分
};

// 难度对应的时间配置
// minTime: 系统认定的"合理最快完成时间"，快于这个时间仍算正常完成，不影响满分获取
const DIFFICULTY_TIME_CONFIG = {
    easy: {
        maxTime: 300,
        minTime: 30,
        baseScore: 80
    },
    medium: {
        maxTime: 600,
        minTime: 60,
        baseScore: 100
    },
    hard: {
        maxTime: 900,
        minTime: 120,
        baseScore: 150
    }
};

// ===============================
// 网络和工具函数
// ===============================

/**
 * 获取本机IP地址
 * @returns {string} 本机IP地址
 */
function getNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        for (const iface of interfaces[interfaceName]) {
            // 跳过内部接口和非IPv4
            if (iface.internal || iface.family !== 'IPv4') continue;

            // 检查是否是局域网IP
            if (iface.address.startsWith('192.168.') ||
                iface.address.startsWith('10.') ||
                iface.address.startsWith('172.')) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// ===============================
// 内存数据存储
// ===============================

// 内存缓存数据结构
let users = new Map(); // 用户数据
let battles = new Map(); // 对战数据
let questions = []; // 题目数据
let errorBank = new Map(); // 错题本数据
let favoriteQuestions = new Map(); // 收藏题目数据

// 匹配队列（按难度分组）
let matchQueue = {
    easy: [],
    medium: [],
    hard: []
};

// WebSocket连接映射
let userWsMap = new Map();

// 好友系统缓存
let friendRequests = new Map(); // key: toUserId, value: array of requests
let friends = new Map(); // key: userId, value: array of friend user IDs
let chatMessages = new Map(); // key: `${userId1}-${userId2}`, value: array of messages

// 待处理的逃跑惩罚通知
let pendingEscapeNotifications = new Map();

// 待发送的已保存/结束对局通知
let pendingBattleNotifications = new Map(); // key: userId, value: array of notifications


// 世界聊天消息缓存（每条消息保存30分钟）
let worldChatMessages = []; // 存储格式: { id, userId, username, content, timestamp, expiresAt }

// 世界聊天清理定时器
let worldChatCleanupTimer = null;

// ===============================
// 状态常量定义
// ===============================

// 对战状态
const BattleState = {
    WAITING: 'waiting', // 等待开始
    PLAYING: 'playing', // 进行中
    FINISHED: 'finished' // 已结束
};

// 好友申请状态
const FriendRequestStatus = {
    PENDING: 'pending', // 待处理
    ACCEPTED: 'accepted', // 已接受
    REJECTED: 'rejected' // 已拒绝
};

// ===============================
// 中间件配置
// ===============================

// CORS配置
app.use(cors({
    origin: true,
    credentials: true
}));

// JSON解析中间件
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

// Session配置
app.use(session({
    name: 'quiz.sid',
    secret: 'quiz-battle-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    },
    rolling: true
}));

// 静态文件服务
app.use(express.static('.', {
    maxAge: '1d',
    etag: false,
    lastModified: false
}));

// ===============================
// 工具函数
// ===============================

/**
 * 获取难度中文描述
 * @param {string} difficulty 难度级别
 * @returns {string} 中文描述
 */
function getDifficultyText(difficulty) {
    switch (difficulty) {
        case 'easy':
            return '简单';
        case 'medium':
            return '中等';
        case 'hard':
            return '困难';
        default:
            return '默认';
    }
}

/**
 * 生成聊天记录键名
 * @param {string} userId1 用户1ID
 * @param {string} userId2 用户2ID
 * @returns {string} 聊天键名
 */
function getChatKey(userId1, userId2) {
    return [userId1, userId2].sort().join('-');
}

/**
 * 发送逃跑惩罚通知
 * @param {string} userId 用户ID
 * @param {number} penalty 惩罚分数
 * @param {number} currentCredit 当前信誉分
 */
function sendEscapePenaltyNotification(userId, penalty, currentCredit) {
    const ws = userWsMap.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'escape_penalty',
            penalty: penalty,
            currentCredit: currentCredit,
            timestamp: new Date().toISOString()
        }));
    } else {
        // 如果用户离线，暂存通知（待重连时推送）
        if (!pendingEscapeNotifications.has(userId)) {
            pendingEscapeNotifications.set(userId, []);
        }
        pendingEscapeNotifications.get(userId).push({
            type: 'escape_penalty',
            penalty: penalty,
            currentCredit: currentCredit,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * 推送待发送的对局通知
 */
function pushPendingBattleNotification(userId, notification) {
    if (!pendingBattleNotifications.has(userId)) pendingBattleNotifications.set(userId, []);
    pendingBattleNotifications.get(userId).push(notification);
}

/**
 * 为用户刷新待发送的对局通知
 */
function flushPendingBattleNotificationsForUser(userId, ws) {
    if (!pendingBattleNotifications.has(userId)) return;
    const arr = pendingBattleNotifications.get(userId);
    arr.forEach(n => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(n));
        }
    });
    pendingBattleNotifications.delete(userId);
}

/**
 * 安全退出处理
 */
async function handleSafeExit(userId, battleId) {
    const battle = battles.get(battleId);
    if (!battle) return { ok: false, message: '对战不存在' };

    const player = battle.players.find(p => p.userId === userId);
    if (!player) return { ok: false, message: '你不在该对战中' };

    // 只有在玩家已完成全部题目时才允许安全退出
    const questionsCount = (battle.questions || []).length;
    const answeredCount = (player.answers || []).filter(a => a).length;
    if (answeredCount < questionsCount) {
        return { ok: false, message: '尚未完成全部题目，无法安全退出' };
    }

    // 标记安全退出
    player.safeExited = true;
    player.finishedAt = new Date().toISOString();

    // 发送确认通知
    const notification = {
        type: 'battle_saved',
        battleId: battleId,
        message: '你的答题已安全保存，可随时查看对局结果（在资料页查看战绩）。',
        timestamp: new Date().toISOString()
    };

    const ws = userWsMap.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(notification));
    } else {
        pushPendingBattleNotification(userId, notification);
    }

    // 持久化对战状态
    await persistBattles();

    return { ok: true, message: '已安全保存对局数据' };
}

// ===============================
// 随机数生成和洗牌算法
// ===============================

/**
 * 高质量随机数生成器
 * @returns {number} 0-1之间的随机数
 */
function getHighQualityRandom() {
    // 优先使用加密随机数
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] / (0xFFFFFFFF + 1);
    }

    // 回退方案：结合多种因素
    const timeFactor = Date.now() % 1000000;
    const perfFactor = performance ? performance.now() % 1000000 : Math.random() * 1000000;
    const mathRandom = Math.random();

    return ((timeFactor + perfFactor + mathRandom * 1000000) % 1000000) / 1000000;
}

/**
 * 高质量洗牌算法
 * @param {Array} array 要洗牌的数组
 * @param {string} sessionSeed 会话种子
 * @returns {Array} 洗牌后的数组
 */
function highQualityShuffle(array, sessionSeed = '') {
    const shuffled = [...array];

    // 添加会话种子增加随机性
    let seedValue = 0;
    if (sessionSeed) {
        seedValue = sessionSeed.split('').reduce((acc, char, idx) =>
            acc + char.charCodeAt(0) * (idx + 1), 0);
    }

    for (let i = shuffled.length - 1; i > 0; i--) {
        // 结合多种随机源
        const randomValue = (getHighQualityRandom() + (seedValue % 1000) / 1000 + i * 0.01) % 1;
        const j = Math.floor(randomValue * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ===============================
// 对战超时和断线处理
// ===============================

/**
 * 检查对战超时（防止双方都卡住）
 */
function checkBattleTimeouts() {
    const now = Date.now();
    battles.forEach((battle, battleId) => {
        if (battle.state === BattleState.PLAYING) {
            const startTime = new Date(battle.startTime).getTime();
            const elapsed = now - startTime;

            // 如果对战超过15分钟，强制结束
            if (elapsed > 15 * 60 * 1000) {
                console.log(`对战 ${battleId} 超时，强制结束`);

                // 根据当前得分判断胜负
                const player1 = battle.players[0];
                const player2 = battle.players[1];

                if (player1.totalScore > player2.totalScore) {
                    forceEndBattle(battleId, player1, player2);
                    updateWinStreak(battle, player1.userId, player2.userId);
                } else if (player2.totalScore > player1.totalScore) {
                    forceEndBattle(battleId, player2, player1);
                    updateWinStreak(battle, player2.userId, player1.userId);
                } else {
                    // 平局
                    battle.state = BattleState.FINISHED;
                    battle.endTime = new Date().toISOString();
                    battle.result = {
                        type: 'draw',
                        scores: {
                            [player1.userId]: player1.totalScore,
                            [player2.userId]: player2.totalScore
                        },
                        timeout: true
                    };

                    // 平局双方各加5分
                    const user1 = users.get(player1.userId);
                    const user2 = users.get(player2.userId);
                    user1.score += 5;
                    user2.score += 5;
                    persistUsers();
                    persistBattles();
                    sendBattleResult(battle);
                }
            }
        }
    });
}

// 每10秒检查一次超时
setInterval(checkBattleTimeouts, 10000);

/**
 * 处理玩家断线
 * @param {string} battleId 对战ID
 * @param {string} disconnectedUserId 断线用户ID
 */
function handlePlayerDisconnect(battleId, disconnectedUserId = null) {
    const battle = battles.get(battleId);
    if (!battle || battle.state !== BattleState.PLAYING) return;

    let winner, loser;

    if (disconnectedUserId) {
        // 特定玩家断线
        winner = battle.players.find(p => p.userId !== disconnectedUserId);
        loser = battle.players.find(p => p.userId === disconnectedUserId);
    } else {
        // 超时处理 - 根据当前得分判断
        if (battle.players[0].totalScore > battle.players[1].totalScore) {
            winner = battle.players[0];
            loser = battle.players[1];
        } else if (battle.players[1].totalScore > battle.players[0].totalScore) {
            winner = battle.players[1];
            loser = battle.players[0];
        } else {
            // 平局
            winner = battle.players[0];
            loser = battle.players[1];
        }
    }

    forceEndBattle(battleId, winner, loser);
}

/**
 * 强制结束对战（当玩家断线时）
 * @param {string} battleId 对战ID
 * @param {Object} winner 胜者数据
 * @param {Object} loser 败者数据
 */
function forceEndBattle(battleId, winner, loser) {
    const battle = battles.get(battleId);
    if (!battle || battle.state !== BattleState.PLAYING) return;

    console.log('强制结束对战:', battleId, '胜者:', winner.userId, '败者:', loser.userId);

    // 计算当前得分（对于已答题目）
    winner.totalScore = winner.answers.reduce((sum, answer) => sum + (answer.score || 0), 0);
    loser.totalScore = loser.answers.reduce((sum, answer) => sum + (answer.score || 0), 0);

    // 设置对战状态
    battle.state = BattleState.FINISHED;
    battle.endTime = new Date().toISOString();

    // 根据难度确定积分变动
    let scoreChange = 10;
    switch (battle.difficulty) {
        case 'medium':
            scoreChange = 20;
            break;
        case 'hard':
            scoreChange = 50;
            break;
    }

    battle.result = {
        type: 'win',
        winner: winner.userId,
        loser: loser.userId,
        scores: {
            [winner.userId]: winner.totalScore,
            [loser.userId]: loser.totalScore
        },
        scoreChange: scoreChange,
        disconnect: true, // 标记为断线结束
        escape: true // 新增：标记为逃跑
    };

    // 更新用户数据 - 积分和胜负记录
    const winnerUser = users.get(winner.userId);
    const loserUser = users.get(loser.userId);

    winnerUser.score += scoreChange;
    loserUser.score = Math.max(0, loserUser.score - Math.floor(scoreChange / 2));
    winnerUser.wins += 1;
    loserUser.losses += 1;

    // 修复：传递 battle 对象给 updateWinStreak
    updateWinStreak(battle, winner.userId, loser.userId);

    // 逃跑者信誉分惩罚（只有未安全退出的才惩罚）
    let escapePenalty = 0;
    if (!loser.safeExited) {
        escapePenalty = updateUserCredit(loser.userId, -CREDIT_CONFIG.ESCAPE_PENALTY, '逃跑比赛');
        loserUser.escapes = (loserUser.escapes || 0) + 1;
        
        // 记录惩罚信息到对战数据
        battle.escapePenalty = {
            userId: loser.userId,
            penalty: Math.abs(escapePenalty),
            reason: '逃跑比赛'
        };
    }

    users.set(winnerUser.id, winnerUser);
    users.set(loserUser.id, loserUser);

    // 记录错题（只记录已答的错题）
    recordErrors(battle);

    // 持久化数据
    persistUsers();
    persistBattles();
    persistErrorBank();

    console.log('强制结束对战完成，发送结果。逃跑惩罚:', escapePenalty);

    // 发送对战结果给双方玩家
    const resultData = {
        type: 'battle_end',
        battleId: battle.id,
        result: battle.result,
        scores: {
            [winner.userId]: winner.totalScore,
            [loser.userId]: loser.totalScore
        },
        difficulty: battle.difficulty,
        disconnect: true,
        escape: true, // 新增：告诉前端这是逃跑结束
        escapePenalty: battle.escapePenalty // 新增：包含惩罚信息
    };

    // 发送给胜者（在线玩家）
    const winnerWs = userWsMap.get(winner.userId);
    if (winnerWs && winnerWs.readyState === WebSocket.OPEN) {
        winnerWs.send(JSON.stringify(resultData));
    }

    // 修复：直接发送逃跑惩罚通知给逃跑者（如果在线）
    if (!loser.safeExited) {
        const escapeNotification = {
            type: 'escape_penalty',
            penalty: battle.escapePenalty ? battle.escapePenalty.penalty : 0, // 修复：发送数值而不是对象
            currentCredit: loserUser.credit, // 修复：添加当前信誉分
            timestamp: new Date().toISOString()
        };

        const loserWs = userWsMap.get(loser.userId);
        if (loserWs && loserWs.readyState === WebSocket.OPEN) {
            loserWs.send(JSON.stringify(escapeNotification));
        } else {
            // 如果逃跑者不在线，将惩罚信息暂存，等其重连时发送
            if (!pendingEscapeNotifications) pendingEscapeNotifications = new Map();
            pendingEscapeNotifications.set(loser.userId, {
                type: 'escape_penalty',
                penalty: battle.escapePenalty ? battle.escapePenalty.penalty : 0, // 修复：发送数值而不是对象
                currentCredit: loserUser.credit, // 修复：添加当前信誉分
                battleInfo: {
                    difficulty: battle.difficulty,
                    opponent: winnerUser.username,
                    endTime: battle.endTime
                }
            });
        }
    }
}

// ===============================
// 数据初始化和持久化
// ===============================

/**
 * 初始化数据存储
 */
async function initData() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR);
    }

    // 初始化用户数据
    try {
        const userData = await fs.readFile(USER_DATA_PATH, 'utf8');
        const parsed = JSON.parse(userData);
        parsed.forEach(user => users.set(user.id, user));
    } catch {
        await fs.writeFile(USER_DATA_PATH, '[]');
    }

    // 初始化对战数据
    try {
        const battleData = await fs.readFile(BATTLE_DATA_PATH, 'utf8');
        const parsed = JSON.parse(battleData);
        parsed.forEach(battle => battles.set(battle.id, battle));
    } catch {
        await fs.writeFile(BATTLE_DATA_PATH, '[]');
    }

    // 初始化题目数据
    try {
        const questionData = await fs.readFile(QUESTION_DATA_PATH, 'utf8');
        questions = JSON.parse(questionData);
        console.log(`加载了 ${questions.length} 道题目`);
    } catch (error) {
        console.log('初始化示例题目数据...');
        await fs.writeFile(QUESTION_DATA_PATH, JSON.stringify(questions, null, 2));
    }

    // 初始化错题数据
    try {
        const errorData = await fs.readFile(ERROR_BANK_PATH, 'utf8');
        const parsed = JSON.parse(errorData);
        parsed.forEach(item => errorBank.set(item.userId, item.errors));
    } catch {
        await fs.writeFile(ERROR_BANK_PATH, '[]');
    }

    // 初始化收藏题目数据
    try {
        const favoriteData = await fs.readFile(FAVORITE_QUESTIONS_PATH, 'utf8');
        const parsedFavorites = JSON.parse(favoriteData);
        parsedFavorites.forEach(({
            userId,
            favorites
        }) => {
            favoriteQuestions.set(userId, favorites);
        });
        console.log(`加载了 ${Array.from(favoriteQuestions.values()).reduce((sum, favs) => sum + favs.length, 0)} 个收藏题目`);
    } catch (error) {
        console.log('初始化收藏题目数据...');
        await fs.writeFile(FAVORITE_QUESTIONS_PATH, '[]');
    }

    // 初始化好友申请数据
    try {
        const friendRequestsData = await fs.readFile(FRIEND_REQUESTS_PATH, 'utf8');
        const parsedRequests = JSON.parse(friendRequestsData);
        parsedRequests.forEach(({
            toUserId,
            requests
        }) => {
            friendRequests.set(toUserId, requests);
        });
    } catch {
        await fs.writeFile(FRIEND_REQUESTS_PATH, '[]');
    }

    // 初始化好友关系数据
    try {
        const friendshipsData = await fs.readFile(FRIENDSHIPS_PATH, 'utf8');
        const parsedFriendships = JSON.parse(friendshipsData);
        parsedFriendships.forEach(({
            userId,
            friendIds
        }) => {
            friends.set(userId, friendIds);
        });
    } catch {
        await fs.writeFile(FRIENDSHIPS_PATH, '[]');
    }

    // 初始化聊天记录数据
    try {
        const chatMessagesData = await fs.readFile(CHAT_MESSAGES_PATH, 'utf8');
        const parsedChats = JSON.parse(chatMessagesData);
        parsedChats.forEach(({
            chatKey,
            messages
        }) => {
            chatMessages.set(chatKey, messages);
        });
    } catch {
        await fs.writeFile(CHAT_MESSAGES_PATH, '[]');
    }

    startWorldChatCleanup();// 启动世界聊天消息清理定时器
    
    console.log('数据初始化完成');
}

/**
 * 持久化用户数据
 */
async function persistUsers() {
    const userArray = Array.from(users.values());
    await fs.writeFile(USER_DATA_PATH, JSON.stringify(userArray, null, 2));
}

/**
 * 持久化对战数据
 */
async function persistBattles() {
    const battleArray = Array.from(battles.values());
    await fs.writeFile(BATTLE_DATA_PATH, JSON.stringify(battleArray, null, 2));
}

/**
 * 持久化错题数据
 */
async function persistErrorBank() {
    const errorArray = Array.from(errorBank.entries()).map(([userId, errors]) => ({
        userId,
        errors
    }));
    await fs.writeFile(ERROR_BANK_PATH, JSON.stringify(errorArray, null, 2));
}

/**
 * 持久化收藏题目数据
 */
async function persistFavoriteQuestions() {
    try {
        const favoriteArray = Array.from(favoriteQuestions.entries()).map(([userId, favorites]) => ({
            userId,
            favorites
        }));
        await fs.writeFile(FAVORITE_QUESTIONS_PATH, JSON.stringify(favoriteArray, null, 2));
        console.log('收藏题目数据持久化完成');
    } catch (error) {
        console.error('持久化收藏题目数据失败:', error);
    }
}

/**
 * 持久化好友数据
 */
async function persistFriendData() {
    try {
        // 持久化好友申请
        const friendRequestsArray = Array.from(friendRequests.entries()).map(([toUserId, requests]) => ({
            toUserId,
            requests
        }));
        await fs.writeFile(FRIEND_REQUESTS_PATH, JSON.stringify(friendRequestsArray, null, 2));

        // 持久化好友关系
        const friendshipsArray = Array.from(friends.entries()).map(([userId, friendIds]) => ({
            userId,
            friendIds
        }));
        await fs.writeFile(FRIENDSHIPS_PATH, JSON.stringify(friendshipsArray, null, 2));

        // 持久化聊天记录
        const chatMessagesArray = Array.from(chatMessages.entries()).map(([chatKey, messages]) => ({
            chatKey,
            messages
        }));
        await fs.writeFile(CHAT_MESSAGES_PATH, JSON.stringify(chatMessagesArray, null, 2));

        console.log('好友数据持久化完成');
    } catch (error) {
        console.error('持久化好友数据失败:', error);
    }
}

// ===============================
// 信誉分管理系统
// ===============================

/**
 * 获取用户信誉分详情
 */
app.get('/api/user/credit', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const user = users.get(req.session.userId);
    if (!user) {
        return res.status(404).json({
            error: '用户不存在'
        });
    }

    const now = new Date();
    const lastUpdate = new Date(user.creditUpdateTime);
    const isNewDay = now.toDateString() !== lastUpdate.toDateString();

    // 如果是新的一天，重置恢复计数
    if (isNewDay) {
        user.dailyRecovered = 0;
        user.creditUpdateTime = now.toISOString();
    }

    // 计算今日可恢复的信誉分
    const remainingRecovery = Math.max(0, CREDIT_CONFIG.DAILY_RECOVERY - (user.dailyRecovered || 0));

    res.json({
        credit: user.credit || 100,
        minCreditForBattle: CREDIT_CONFIG.MIN_CREDIT_FOR_BATTLE,
        maxCredit: CREDIT_CONFIG.MAX_CREDIT,
        dailyRecovery: CREDIT_CONFIG.DAILY_RECOVERY,
        remainingRecovery: remainingRecovery,
        escapes: user.escapes || 0,
        negativeGames: user.negativeGames || 0,
        canJoinBattle: (user.credit || 100) >= CREDIT_CONFIG.MIN_CREDIT_FOR_BATTLE
    });
});

/**
 * 处理准备阶段的对战断开
 * @param {string} battleId 对战ID
 * @param {string} disconnectedUserId 断开连接的用户ID
 */
function handleWaitingBattleDisconnect(battleId, disconnectedUserId) {
    const battle = battles.get(battleId);
    if (!battle || battle.state !== BattleState.WAITING) return;

    console.log('处理准备阶段断开:', battleId, '断开玩家:', disconnectedUserId);

    // 找到断开玩家和在线玩家
    const disconnectedPlayer = battle.players.find(p => p.userId === disconnectedUserId);
    const onlinePlayer = battle.players.find(p => p.userId !== disconnectedUserId);

    if (!onlinePlayer) {
        // 如果两个玩家都断开了，直接删除对战
        battles.delete(battleId);
        console.log('双方都断开，删除对战:', battleId);
        return;
    }

    // 立即结束对战，断开玩家判负
    battle.state = BattleState.FINISHED;
    battle.endTime = new Date().toISOString();

    // 根据难度确定积分变动
    let scoreChange = 10;
    switch (battle.difficulty) {
        case 'medium':
            scoreChange = 20;
            break;
        case 'hard':
            scoreChange = 50;
            break;
    }

    battle.result = {
        type: 'win',
        winner: onlinePlayer.userId,
        loser: disconnectedPlayer.userId,
        scores: {
            [onlinePlayer.userId]: 0,
            [disconnectedPlayer.userId]: 0
        },
        scoreChange: scoreChange,
        disconnect: true,
        escape: true,
        waitingPhase: true // 标记为准备阶段逃跑
    };

    // 更新用户数据
    const winnerUser = users.get(onlinePlayer.userId);
    const loserUser = users.get(disconnectedPlayer.userId);

    winnerUser.score += scoreChange;
    // 败者不扣分，因为还没开始比赛
    winnerUser.wins += 1;
    loserUser.losses += 1;

    // 逃跑者信誉分惩罚
    const escapePenalty = updateUserCredit(disconnectedPlayer.userId, -CREDIT_CONFIG.ESCAPE_PENALTY, '准备阶段逃跑');
    loserUser.escapes = (loserUser.escapes || 0) + 1;

    // 记录惩罚信息
    battle.escapePenalty = {
        userId: disconnectedPlayer.userId,
        penalty: Math.abs(escapePenalty),
        reason: '准备阶段逃跑'
    };

    users.set(winnerUser.id, winnerUser);
    users.set(loserUser.id, loserUser);

    // 持久化数据
    persistUsers();
    persistBattles();

    console.log('准备阶段对战结束处理完成');

    // 发送对战结果给在线玩家
    const resultData = {
        type: 'battle_end',
        battleId: battle.id,
        result: battle.result,
        scores: {
            [onlinePlayer.userId]: 0,
            [disconnectedPlayer.userId]: 0
        },
        difficulty: battle.difficulty,
        disconnect: true,
        escape: true,
        waitingPhase: true, // 告诉前端这是准备阶段逃跑
        escapePenalty: battle.escapePenalty
    };

    const onlineWs = userWsMap.get(onlinePlayer.userId);
    if (onlineWs && onlineWs.readyState === WebSocket.OPEN) {
        onlineWs.send(JSON.stringify(resultData));
    }

    // 为逃跑者暂存惩罚信息
    if (!pendingEscapeNotifications) pendingEscapeNotifications = new Map();

    pendingEscapeNotifications.set(disconnectedPlayer.userId, {
        type: 'escape_penalty',
        battleId: battle.id,
        penalty: battle.escapePenalty.penalty, // 正确：只发送数值
        currentCredit: loserUser.credit, // 添加当前信誉分
        battleInfo: {
            difficulty: battle.difficulty,
            opponent: winnerUser.username,
            endTime: battle.endTime,
            waitingPhase: true
        }
    });
}

// ===============================
// 用户管理API
// ===============================

/**
 * 用户注册
 */
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (Array.from(users.values()).some(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    const user = {
        id: `user-${uuidv4()}`,
        username,
        password,
        email,
        score: 1000,
        credit: 100,
        dailyRecovered: 0,
        creditUpdateTime: new Date().toISOString(),
        wins: 0,
        losses: 0,
        escapes: 0,
        negativeGames: 0,
        currentStreak: 0,        // 确保有这个字段
        maxStreak: 0,            // 确保有这个字段
        battleHistory: [],
        createdAt: new Date().toISOString()
    };

    users.set(user.id, user);
    await persistUsers();

    req.session.userId = user.id;
    res.status(201).json({
        id: user.id,
        username: user.username,
        score: user.score
    });
});
/**
 * 用户登录
 */
app.post('/api/login', async (req, res) => {
    const {
        username,
        password
    } = req.body;
    const user = Array.from(users.values()).find(
        u => u.username === username && u.password === password
    );

    if (!user) {
        return res.status(401).json({
            error: '用户名或密码错误'
        });
    }

    req.session.userId = user.id;
    res.json({
        id: user.id,
        username: user.username,
        score: user.score,
        wins: user.wins,
        losses: user.losses
    });
});

/**
 * 获取当前用户信息
 */
app.get('/api/user', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const user = users.get(req.session.userId);
    if (!user) {
        return res.status(404).json({
            error: '用户不存在'
        });
    }

    res.json({
        id: user.id,
        username: user.username,
        score: user.score,
        wins: user.wins,
        losses: user.losses,
        email: user.email,
        currentStreak: user.currentStreak,
        maxStreak: user.maxStreak,
        credit: user.credit,
        escapes: user.escapes,
        negativeGames: user.negativeGames,
    });
});

/**
 * 更新个人信息
 */
app.put('/api/user/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        username,
        email
    } = req.body;
    const userId = req.session.userId;
    const user = users.get(userId);

    if (!user) {
        return res.status(404).json({
            error: '用户不存在'
        });
    }

    // 检查用户名是否已被其他用户使用
    const existingUser = Array.from(users.values()).find(
        u => u.username === username && u.id !== userId
    );
    if (existingUser) {
        return res.status(400).json({
            error: '用户名已存在'
        });
    }

    // 更新用户信息
    user.username = username;
    if (email) {
        user.email = email;
    }

    users.set(userId, user);
    await persistUsers();

    res.json({
        success: true,
        message: '个人信息更新成功',
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            score: user.score,
            wins: user.wins,
            losses: user.losses
        }
    });
});

/**
 * 修改密码
 */
app.put('/api/user/password', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        currentPassword,
        newPassword
    } = req.body;
    const userId = req.session.userId;
    const user = users.get(userId);

    if (!user) {
        return res.status(404).json({
            error: '用户不存在'
        });
    }

    // 验证当前密码
    if (user.password !== currentPassword) {
        return res.status(400).json({
            error: '当前密码错误'
        });
    }

    // 更新密码
    user.password = newPassword;
    users.set(userId, user);
    await persistUsers();

    res.json({
        success: true,
        message: '密码修改成功'
    });
});

// ===============================
// 对战历史API
// ===============================

/**
 * 获取用户对战历史
 */
app.get('/api/battle-history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const userBattles = [];

    // 遍历所有对战记录
    battles.forEach(battle => {
        if (battle.state === BattleState.FINISHED) {
            const player = battle.players.find(p => p.userId === userId);
            if (player) {
                const opponent = battle.players.find(p => p.userId !== userId);
                const opponentUser = users.get(opponent.userId);

                userBattles.push({
                    id: battle.id,
                    difficulty: battle.difficulty,
                    resultType: battle.result.type,
                    winnerId: battle.result.winner,
                    userScore: player.totalScore || player.answers.reduce((sum, answer) => sum + (answer.score || 0), 0),
                    opponentScore: opponent.totalScore || opponent.answers.reduce((sum, answer) => sum + (answer.score || 0), 0),
                    opponent: opponentUser ? {
                        id: opponentUser.id,
                        username: opponentUser.username
                    } : null,
                    endTime: battle.endTime,
                    players: battle.players.map(p => ({
                        userId: p.userId,
                        username: users.get(p.userId)?.username,
                        score: p.totalScore || p.answers.reduce((sum, answer) => sum + (answer.score || 0), 0)
                    }))
                });
            }
        }
    });

    // 按结束时间倒序排列
    userBattles.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

    res.json(userBattles);
});

// ===============================
// 排行榜API
// ===============================

/**
 * 获取积分排行榜
 */
app.get('/api/leaderboard/score', (req, res) => {
    const userArray = Array.from(users.values());

    // 按积分排序
    const scoreRanking = userArray
        .filter(user => user.wins + user.losses > 0) // 只包含有对战记录的玩家
        .sort((a, b) => b.score - a.score)
        .slice(0, 100) // 前100名
        .map((user, index) => ({
            rank: index + 1,
            userId: user.id,
            username: user.username,
            score: user.score,
            wins: user.wins,
            losses: user.losses,
            totalBattles: user.wins + user.losses
        }));

    res.json(scoreRanking);
});

/**
 * 获取胜率排行榜
 */
app.get('/api/leaderboard/win-rate', (req, res) => {
    const userArray = Array.from(users.values());

    const winRateRanking = userArray
        .filter(user => {
            const totalBattles = (user.wins || 0) + (user.losses || 0);
            return totalBattles >= 3; // 降低门槛到3场
        })
        .map(user => {
            const wins = user.wins || 0;
            const losses = user.losses || 0;
            const totalBattles = wins + losses;
            const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;
            
            return {
                userId: user.id,
                username: user.username,
                wins: wins,
                losses: losses,
                totalBattles: totalBattles,
                winRate: winRate
            };
        })
        .sort((a, b) => b.winRate - a.winRate || b.totalBattles - a.totalBattles)
        .slice(0, 100)
        .map((user, index) => ({
            ...user,
            rank: index + 1
        }));

    res.json(winRateRanking);
});
/**
 * 获取用户信誉分历史记录
 */
app.get('/api/user/credit-history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: '未登录' });
    }

    const user = users.get(req.session.userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 返回信誉历史记录，按时间倒序排列
    const creditHistory = (user.creditHistory || [])
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50); // 只返回最近50条记录

    res.json({
        credit: user.credit || 100,
        history: creditHistory
    });
});
/**
 * 获取连胜排行榜
 */
app.get('/api/leaderboard/streak', (req, res) => {
    const userArray = Array.from(users.values());

    const streakRanking = userArray
        .filter(user => {
            // 修复：确保有必要的字段且至少有一场对战
            const totalBattles = (user.wins || 0) + (user.losses || 0);
            return totalBattles >= 1; // 降低门槛，只要有对战记录即可
        })
        .map(user => ({
            userId: user.id,
            username: user.username,
            currentStreak: user.currentStreak || 0,  // 确保有默认值
            maxStreak: user.maxStreak || 0,          // 确保有默认值
            totalBattles: (user.wins || 0) + (user.losses || 0),
            winRate: (user.wins || 0) + (user.losses || 0) > 0 ? 
                Math.round(((user.wins || 0) / ((user.wins || 0) + (user.losses || 0))) * 100) : 0
        }))
        .sort((a, b) => {
            // 优先按当前连胜排序，当前连胜相同的按最高连胜排序
            if (b.currentStreak !== a.currentStreak) {
                return b.currentStreak - a.currentStreak;
            }
            return b.maxStreak - a.maxStreak;
        })
        .slice(0, 100)
        .map((user, index) => ({
            ...user,
            rank: index + 1
        }));

    res.json(streakRanking);
});

/**
 * 获取好友排行榜
 */
app.get('/api/leaderboard/friends', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const friendIds = friends.get(userId) || [];
    const userArray = Array.from(users.values());

    const friendsRanking = userArray
        .filter(user => friendIds.includes(user.id))
        .map(user => ({
            userId: user.id,
            username: user.username,
            score: user.score,
            wins: user.wins,
            losses: user.losses,
            online: userWsMap.has(user.id)
        }))
        .sort((a, b) => b.score - a.score)
        .map((user, index) => ({
            ...user,
            rank: index + 1
        }));

    res.json(friendsRanking);
});

/**
 * 获取难度专项排行榜
 */
app.get('/api/leaderboard/difficulty/:difficulty', (req, res) => {
    const {
        difficulty
    } = req.params;

    // 这里需要扩展对战数据来记录各难度胜场
    // 暂时使用模拟数据
    const userArray = Array.from(users.values());

    const difficultyRanking = userArray
        .filter(user => user.wins + user.losses >= 3)
        .map(user => ({
            userId: user.id,
            username: user.username,
            difficultyWins: Math.min(user.wins, Math.floor(Math.random() * user.wins) + 1), // 模拟数据
            difficultyBattles: Math.min(user.wins + user.losses, Math.floor(Math.random() * (user.wins + user.losses)) + 3),
            totalScore: user.score
        }))
        .map(user => ({
            ...user,
            winRate: user.difficultyBattles > 0 ?
                Math.round((user.difficultyWins / user.difficultyBattles) * 100) : 0
        }))
        .sort((a, b) => b.difficultyWins - a.difficultyWins || b.winRate - a.winRate)
        .slice(0, 50)
        .map((user, index) => ({
            ...user,
            rank: index + 1
        }));

    res.json(difficultyRanking);
});

/**
 * 获取用户在所有榜单中的排名
 */
app.get('/api/leaderboard/my-rank', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const user = users.get(userId);
    const userArray = Array.from(users.values());

    if (!user) {
        return res.status(404).json({
            error: '用户不存在'
        });
    }

    // 积分排名
    const scoreRanking = userArray
        .filter(u => u.wins + u.losses > 0)
        .sort((a, b) => b.score - a.score);
    const scoreRank = scoreRanking.findIndex(u => u.id === userId) + 1;

    // 胜率排名
    const winRateRanking = userArray
        .filter(u => u.wins + u.losses >= 5)
        .map(u => ({
            ...u,
            winRate: u.wins + u.losses > 0 ?
                Math.round((u.wins / (u.wins + u.losses)) * 100) : 0
        }))
        .sort((a, b) => b.winRate - a.winRate || b.wins + b.losses - a.wins + a.losses);
    const winRateRank = winRateRanking.findIndex(u => u.id === userId) + 1;

    res.json({
        scoreRank: scoreRank || '未上榜',
        winRateRank: winRateRank || '未上榜',
        totalPlayers: userArray.filter(u => u.wins + u.losses > 0).length
    });
});

// ===============================
// 信誉分管理核心函数
// ===============================

/**
 * 更新用户信誉分
 * @param {string} userId 用户ID
 * @param {number} change 变化值（正数为加分，负数为扣分）
 * @param {string} reason 变化原因
 * @returns {number} 实际变化值
 */
function updateUserCredit(userId, change, reason = '') {
    const user = users.get(userId);
    if (!user) return;

    const now = new Date();
    const lastUpdate = new Date(user.creditUpdateTime);
    const isNewDay = now.toDateString() !== lastUpdate.toDateString();

    // 如果是新的一天，重置恢复计数
    if (isNewDay) {
        user.dailyRecovered = 0;
    }

    let actualChange = change;

    // 处理加分（恢复信誉分）
    if (change > 0) {
        const canRecover = CREDIT_CONFIG.DAILY_RECOVERY - (user.dailyRecovered || 0);
        actualChange = Math.min(change, canRecover, CREDIT_CONFIG.MAX_CREDIT - user.credit);
        user.dailyRecovered = (user.dailyRecovered || 0) + actualChange;
    }
    // 处理扣分
    else if (change < 0) {
        actualChange = Math.max(change, -user.credit);
    }

    user.credit += actualChange;
    user.creditUpdateTime = now.toISOString();

    console.log(`用户 ${user.username} 信誉分${change > 0 ? '增加' : '减少'} ${Math.abs(actualChange)}，原因：${reason}，当前：${user.credit}`);

    // 记录详细变化 - 修复字段名问题
    user.creditHistory = user.creditHistory || [];
    user.creditHistory.push({
        penalty: actualChange < 0 ? Math.abs(actualChange) : 0,    // 扣分数值（绝对值）
        reward: actualChange > 0 ? actualChange : 0,               // 加分数值
        change: actualChange,                                      // 总变化值（保持兼容）
        reason,
        timestamp: now.toISOString(),
        currentCredit: user.credit
    });

    // 保留最近100条记录
    if (user.creditHistory.length > 100) {
        user.creditHistory = user.creditHistory.slice(-100);
    }

    users.set(userId, user);
    return actualChange;
}

/**
 * 检查用户是否可以参与对战
 * @param {string} userId 用户ID
 * @returns {boolean} 是否可以参与对战
 */
function canJoinBattle(userId) {
    const user = users.get(userId);
    if (!user) return false;

    return user.credit >= CREDIT_CONFIG.MIN_CREDIT_FOR_BATTLE;
}

/**
 * 检测消极比赛
 * @param {Object} battle 对战数据
 * @param {Object} player 玩家数据
 * @returns {boolean} 是否为消极比赛
 */
function isNegativeGame(battle, player) {
    const config = DIFFICULTY_TIME_CONFIG[battle.difficulty] || DIFFICULTY_TIME_CONFIG.medium;
    const minTime = config.minTime * 1000; // 转换为毫秒

    const battleStartTime = new Date(battle.startTime).getTime();
    const battleEndTime = new Date(battle.endTime || Date.now()).getTime();
    const battleDuration = battleEndTime - battleStartTime;

    // 答题正确数
    const correctAnswers = player.answers.filter(answer => answer.correct).length;

    // 判断条件：正确题数低于1道且比赛时长过短
    return correctAnswers < 1 && battleDuration < minTime;
}

// ===============================
// 题目和题库管理API
// ===============================

/**
 * 获取所有题目
 */
app.get('/api/questions', (req, res) => {
    res.json(questions);
});

/**
 * 获取错题本
 */
app.get('/api/error-bank', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const errors = errorBank.get(req.session.userId) || [];
    const enrichedErrors = errors.map(error => {
        const originalQuestion = questions.find(q => q.id === error.questionId);
        if (originalQuestion) {
            return {
                ...error,
                content: originalQuestion.content,
                analysis: originalQuestion.analysis || error.analysis,
                type: originalQuestion.type || error.type,
                difficulty: originalQuestion.difficulty || error.difficulty,
                options: originalQuestion.options || [] // 添加选项信息
            };
        }
        return error;
    });

    res.json(enrichedErrors);
});

// ===============================
// 收藏题目API
// ===============================

/**
 * 获取收藏题目
 */
app.get('/api/favorite-questions', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const favorites = favoriteQuestions.get(req.session.userId) || [];
    // 补充题目完整信息
    const enrichedFavorites = favorites.map(favorite => {
        const originalQuestion = questions.find(q => q.id === favorite.questionId);
        if (originalQuestion) {
            return {
                ...favorite,
                content: originalQuestion.content,
                analysis: originalQuestion.analysis || favorite.analysis,
                type: originalQuestion.type || favorite.type,
                difficulty: originalQuestion.difficulty || favorite.difficulty,
                options: originalQuestion.options || []
            };
        }
        return favorite;
    });

    res.json(enrichedFavorites);
});

/**
 * 添加收藏题目
 */
app.post('/api/favorite-questions', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        questionId
    } = req.body;
    const userId = req.session.userId;

    if (!questionId) {
        return res.status(400).json({
            error: '缺少题目ID'
        });
    }

    // 查找题目
    const question = questions.find(q => q.id === questionId);
    if (!question) {
        return res.status(404).json({
            error: '题目不存在'
        });
    }

    const userFavorites = favoriteQuestions.get(userId) || [];

    // 检查是否已经收藏
    const alreadyFavorited = userFavorites.some(fav => fav.questionId === questionId);
    if (alreadyFavorited) {
        return res.status(400).json({
            error: '题目已收藏'
        });
    }

    // 添加收藏
    const favorite = {
        questionId,
        content: question.content,
        answer: question.answer,
        analysis: question.analysis,
        type: question.type,
        difficulty: question.difficulty,
        options: question.options,
        timestamp: new Date().toISOString()
    };

    userFavorites.push(favorite);
    favoriteQuestions.set(userId, userFavorites);
    await persistFavoriteQuestions();

    res.json({
        success: true,
        message: '题目已收藏'
    });
});

/**
 * 取消收藏
 */
app.delete('/api/favorite-questions/:questionId', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        questionId
    } = req.params;
    const userId = req.session.userId;

    const userFavorites = favoriteQuestions.get(userId) || [];
    const updatedFavorites = userFavorites.filter(fav => fav.questionId !== questionId);

    if (updatedFavorites.length === userFavorites.length) {
        return res.status(404).json({
            error: '未找到收藏的题目'
        });
    }

    favoriteQuestions.set(userId, updatedFavorites);
    await persistFavoriteQuestions();

    res.json({
        success: true,
        message: '已取消收藏'
    });
});

/**
 * 导出收藏题目
 */
app.get('/api/favorite-questions/export', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    try {
        const userId = req.session.userId;
        const favorites = favoriteQuestions.get(userId) || [];

        if (favorites.length === 0) {
            return res.status(400).json({
                error: '收藏题库为空'
            });
        }

        let markdownContent = '# 收藏题库\n\n';
        markdownContent += `导出时间：${new Date().toLocaleString('zh-CN')}\n`;
        markdownContent += `题目数量：${favorites.length}\n\n`;
        markdownContent += '---\n\n';

        favorites.forEach((favorite, index) => {
            markdownContent += `## 第 ${index + 1} 题\n\n`;
            markdownContent += `**题目：** ${favorite.content || '题目内容缺失'}\n\n`;

            if (favorite.options && favorite.options.length > 0 && favorite.type !== 'fill') {
                markdownContent += `**选项：**\n`;
                favorite.options.forEach((option, optIndex) => {
                    const optionLabel = String.fromCharCode(65 + optIndex);
                    markdownContent += `${optionLabel}. ${option}\n`;
                });
                markdownContent += `\n`;
            }

            markdownContent += `**正确答案：** ${favorite.answer || '答案缺失'}\n\n`;
            markdownContent += `**解析：** ${favorite.analysis || '暂无解析'}\n\n`;
            markdownContent += `**题型：** ${favorite.type || '未知'}\n\n`;
            markdownContent += `**难度：** ${getDifficultyText(favorite.difficulty)}\n\n`;
            markdownContent += `**收藏时间：** ${new Date(favorite.timestamp).toLocaleString('zh-CN')}\n\n`;
            markdownContent += '---\n\n';
        });

        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', 'attachment; filename=favorite_questions.md');
        res.send(markdownContent);

    } catch (error) {
        console.error('导出收藏题目时发生错误:', error);
        res.status(500).json({
            error: '服务器内部错误: ' + error.message
        });
    }
});

/**
 * 清空收藏题目
 */
app.delete('/api/favorite-questions', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    try {
        favoriteQuestions.set(req.session.userId, []);
        await persistFavoriteQuestions();
        res.json({
            success: true,
            message: '收藏题库已清空'
        });
    } catch (err) {
        res.status(500).json({
            error: '清空收藏题库失败'
        });
    }
});

// ===============================
// 对战核心逻辑
// ===============================

/**
 * 获取对战详情
 */
app.get('/api/battles/:id', (req, res) => {
    const battle = battles.get(req.params.id);
    if (!battle) {
        return res.status(404).json({
            error: '对战不存在'
        });
    }
    res.json(battle);
});

/**
 * 按难度筛选题目
 * @param {string} difficulty 难度级别
 * @param {number} count 题目数量
 * @param {string} sessionId 会话ID
 * @returns {Array} 题目数组
 */
function getRandomQuestions(difficulty, count = 5, sessionId = '') {
    console.log(`正在为难度 ${difficulty} 选择 ${count} 道题目，会话: ${sessionId}`);

    const TARGET_DISTRIBUTION = {
        choice: 2,
        multi: 1,
        fill: 2
    };

    const filteredByType = {
        choice: questions.filter(q => q.difficulty === difficulty && q.type === 'choice'),
        multi: questions.filter(q => q.difficulty === difficulty && q.type === 'multi'),
        fill: questions.filter(q => q.difficulty === difficulty && q.type === 'fill')
    };

    let result = [];

    Object.entries(TARGET_DISTRIBUTION).forEach(([type, targetCount]) => {
        const available = filteredByType[type];

        if (available.length >= targetCount) {
            result.push(...highQualityShuffle(available, sessionId + type).slice(0, targetCount));
        } else {
            const currentDifficultyQuestions = highQualityShuffle(available, sessionId + type);
            result.push(...currentDifficultyQuestions);

            const needed = targetCount - currentDifficultyQuestions.length;
            if (needed > 0) {
                const otherDifficultyQuestions = questions.filter(
                    q => q.difficulty !== difficulty && q.type === type
                );
                const shuffledOther = highQualityShuffle(otherDifficultyQuestions, sessionId + type + 'other');
                result.push(...shuffledOther.slice(0, needed));
            }
        }
    });

    return highQualityShuffle(result, sessionId + 'final');
}

/**
 * 计算得分（根据难度对应时间调整奖励衰减）
 * @param {number} timeTaken 答题用时（毫秒）
 * @param {string} difficulty 难度级别
 * @returns {number} 得分
 */
function calculateScore(timeTaken, difficulty) {
    const config = DIFFICULTY_TIME_CONFIG[difficulty] || DIFFICULTY_TIME_CONFIG.medium;
    const {
        baseScore,
        maxTime,
        minTime
    } = config;

    if (timeTaken <= minTime) return baseScore;
    if (timeTaken >= maxTime) return Math.round(baseScore * 0.3);

    return Math.round(
        baseScore - (baseScore * 0.7) * (timeTaken - minTime) / (maxTime - minTime)
    );
}

/**
 * 在匹配队列中查找对手
 * @param {string} currentUserId 当前用户ID
 * @param {string} difficulty 难度级别
 * @returns {number} 对手在队列中的索引
 */
function findOpponentInQueue(currentUserId, difficulty) {
    const queue = matchQueue[difficulty] || [];
    return queue.findIndex(userId => userId !== currentUserId);
}

/**
 * 检查对战是否完成
 * @param {string} battleId 对战ID
 */
function checkBattleCompletion(battleId) {
    const battle = battles.get(battleId);
    if (!battle || battle.state !== BattleState.PLAYING) return;

    const allQuestionsAnswered = battle.players.every(player =>
        player.answers.length === battle.questions.length
    );

    if (allQuestionsAnswered) {
        console.log('对战完成，开始结算:', battleId);
        handleBattleEnd(battleId);
    }
}

/**
 * 更新连胜记录
 * @param {Object} battle 对战数据
 * @param {string} winnerId 胜者ID
 * @param {string} loserId 败者ID
 */
function updateWinStreak(battle, winnerId, loserId) {
    const winner = users.get(winnerId);
    const loser = users.get(loserId);

    if (winner) {
        // 胜者连胜+1
        winner.currentStreak = (winner.currentStreak || 0) + 1;
        winner.maxStreak = Math.max(winner.maxStreak || 0, winner.currentStreak);

        // 记录对战历史
        winner.battleHistory = winner.battleHistory || [];
        winner.battleHistory.push({
            battleId: battle.id,
            result: 'win',
            opponent: loser ? loser.username : '未知',
            score: winner.totalScore,
            timestamp: new Date().toISOString()
        });

        // 保留最近50场记录
        if (winner.battleHistory.length > 50) {
            winner.battleHistory = winner.battleHistory.slice(-50);
        }
    }

    if (loser) {
        // 败者连胜清零
        loser.currentStreak = 0;

        // 记录对战历史
        loser.battleHistory = loser.battleHistory || [];
        loser.battleHistory.push({
            battleId: battle.id,
            result: 'loss',
            opponent: winner ? winner.username : '未知',
            score: loser.totalScore,
            timestamp: new Date().toISOString()
        });

        // 保留最近50场记录
        if (loser.battleHistory.length > 50) {
            loser.battleHistory = loser.battleHistory.slice(-50);
        }
    }
}

/**
 * 处理对战结束
 * @param {string} battleId 对战ID
 */
function handleBattleEnd(battleId) {
    const battle = battles.get(battleId);
    if (!battle || battle.state === BattleState.FINISHED) return;

    console.log('开始处理对战结束:', battleId);

    const [player1, player2] = battle.players;
 // 新增：正常对局加分逻辑
    battle.players.forEach(player => {
        const user = users.get(player.userId);
        
        // 检查是否为正常比赛（非消极比赛）
        if (!isNegativeGame(battle, player)) {
            // 正常比赛加分
            const reward = updateUserCredit(player.userId, CREDIT_CONFIG.NORMAL_REWARD, '正常完成对局');
            console.log(`用户 ${user.username} 因正常完成对局加分: +${CREDIT_CONFIG.NORMAL_REWARD}, 当前信誉分: ${user.credit}`);

        } else {
            // 消极比赛扣分（原有的惩罚逻辑）
            console.log(`检测到消极比赛: 玩家 ${player.userId}`);
            const penalty = updateUserCredit(player.userId, -CREDIT_CONFIG.NEGATIVE_PENALTY, '消极比赛');
            user.negativeGames = (user.negativeGames || 0) + 1;
            console.log(`用户 ${user.username} 因消极比赛扣分: ${CREDIT_CONFIG.NEGATIVE_PENALTY}, 当前信誉分: ${user.credit}`);
        }
    });

    // 计算总分
    player1.totalScore = player1.answers.reduce((sum, answer) => sum + (answer.score || 0), 0);
    player2.totalScore = player2.answers.reduce((sum, answer) => sum + (answer.score || 0), 0);

    console.log('玩家得分:', {
        player1: {
            userId: player1.userId,
            score: player1.totalScore,
            answers: player1.answers
        },
        player2: {
            userId: player2.userId,
            score: player2.totalScore,
            answers: player2.answers
        }
    });

    // 确定胜负
    let winner, loser;
    if (player1.totalScore > player2.totalScore) {
        winner = player1;
        loser = player2;
    } else if (player2.totalScore > player1.totalScore) {
        winner = player2;
        loser = player1;
    } else {
        // 平局处理
        battle.state = BattleState.FINISHED;
        battle.endTime = new Date().toISOString();
        battle.result = {
            type: 'draw',
            scores: {
                [player1.userId]: player1.totalScore,
                [player2.userId]: player2.totalScore
            }
        };

        // 平局双方各加5分
        const user1 = users.get(player1.userId);
        const user2 = users.get(player2.userId);
        user1.score += 5;
        user2.score += 5;
        users.set(user1.id, user1);
        users.set(user2.id, user2);

        // 记录错题（平局也要记录）
        recordErrors(battle);

        persistUsers();
        persistBattles();

        // 发送平局结果
        sendBattleResult(battle);
        return;
    }

    // 根据难度确定积分变动
    let scoreChange = 10;
    switch (battle.difficulty) {
        case 'medium':
            scoreChange = 20;
            break;
        case 'hard':
            scoreChange = 50;
            break;
    }

    // 处理胜负结果
    battle.state = BattleState.FINISHED;
    battle.endTime = new Date().toISOString();
    battle.result = {
        type: 'win',
        winner: winner.userId,
        loser: loser.userId,
        scores: {
            [winner.userId]: winner.totalScore,
            [loser.userId]: loser.totalScore
        },
        scoreChange: scoreChange
    };

    // 更新用户数据
    const winnerUser = users.get(winner.userId);
    const loserUser = users.get(loser.userId);

    winnerUser.score += scoreChange;
    loserUser.score = Math.max(0, loserUser.score - Math.floor(scoreChange / 2));
    winnerUser.wins += 1;
    loserUser.losses += 1;

    users.set(winnerUser.id, winnerUser);
    users.set(loserUser.id, loserUser);

    // 记录错题
    console.log('开始记录错题...');
    recordErrors(battle);

    // 持久化数据
    persistUsers();
    persistBattles();
    persistErrorBank();

    console.log('对战结束处理完成，发送结果');
    // 发送结果
    sendBattleResult(battle);
}

/**
 * 记录错题
 * @param {Object} battle 对战数据
 */
function recordErrors(battle) {
    console.log('开始记录错题，对战ID:', battle.id);

    battle.questions.forEach((q, index) => {
        const originalQuestion = questions.find(origQ => origQ.id === q.id);

        // 检查玩家1的答题情况
        const p1Answer = battle.players[0].answers[index];
        if (p1Answer && !p1Answer.correct) {
            console.log(`记录玩家1错题: ${battle.players[0].userId}, 题目${index}`);
            const errors = errorBank.get(battle.players[0].userId) || [];
            // 避免重复记录
            const alreadyRecorded = errors.some(err =>
                err.questionId === q.id && err.battleId === battle.id
            );
            if (!alreadyRecorded) {
                errors.push({
                    questionId: q.id,
                    content: originalQuestion ? originalQuestion.content : q.content,
                    userAnswer: p1Answer.answer,
                    correctAnswer: originalQuestion ? originalQuestion.answer : q.answer,
                    analysis: originalQuestion ? originalQuestion.analysis : q.analysis,
                    difficulty: q.difficulty,
                    type: q.type,
                    battleId: battle.id,
                    timestamp: new Date().toISOString()
                });
                errorBank.set(battle.players[0].userId, errors);
            }
        }

        // 检查玩家2的答题情况
        const p2Answer = battle.players[1].answers[index];
        if (p2Answer && !p2Answer.correct) {
            console.log(`记录玩家2错题: ${battle.players[1].userId}, 题目${index}`);
            const errors = errorBank.get(battle.players[1].userId) || [];
            // 避免重复记录
            const alreadyRecorded = errors.some(err =>
                err.questionId === q.id && err.battleId === battle.id
            );
            if (!alreadyRecorded) {
                errors.push({
                    questionId: q.id,
                    content: originalQuestion ? originalQuestion.content : q.content,
                    userAnswer: p2Answer.answer,
                    correctAnswer: originalQuestion ? originalQuestion.answer : q.answer,
                    analysis: originalQuestion ? originalQuestion.analysis : q.analysis,
                    difficulty: q.difficulty,
                    type: q.type,
                    battleId: battle.id,
                    timestamp: new Date().toISOString()
                });
                errorBank.set(battle.players[1].userId, errors);
            }
        }
    });

    console.log('错题记录完成');
}

/**
 * 发送对战结果
 * @param {Object} battle 对战数据
 */
function sendBattleResult(battle) {
    const resultData = {
        type: 'battle_end',
        battleId: battle.id,
        result: battle.result,
        scores: {
            [battle.players[0].userId]: battle.players[0].totalScore,
            [battle.players[1].userId]: battle.players[1].totalScore
        },
        difficulty: battle.difficulty
    };

    if (battle.result.type === 'win') {
        resultData.scoreChange = battle.result.scoreChange;
    }

    // 发送给双方玩家
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN &&
            (client.userId === battle.players[0].userId || client.userId === battle.players[1].userId)) {
            client.send(JSON.stringify(resultData));
        }
    });
}

// ===============================
// WebSocket连接处理
// ===============================

wss.on('connection', (ws, req) => {
    console.log('新的客户端连接:', req.socket.remoteAddress);
    let userId = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'auth':
                    ws.userId = data.userId;
                    userWsMap.set(data.userId, ws);
                    console.log(`用户 ${data.userId} 已通过WebSocket验证`);
                    // 检查是否有待处理的逃跑通知 
                    if (pendingEscapeNotifications.has(data.userId)) {
                        const notification = pendingEscapeNotifications.get(data.userId);
                        ws.send(JSON.stringify(notification)); // 发送待处理的逃跑通知
                        pendingEscapeNotifications.delete(data.userId); // 移除已发送的通知
                        console.log(`发送待处理的逃跑通知给用户 ${data.userId}`);
                    }
                    
                    // 新增：刷新任何待发的已保存/已结算对局通知
                    flushPendingBattleNotificationsForUser(data.userId, ws);
                    break;

                case 'safe_exit':
                    if (!ws.userId) {
                        ws.send(JSON.stringify({ type: 'safe_exit_ack', ok: false, message: '未认证' }));
                        break;
                    }
                    try {
                        const { battleId } = data;
                        const res = await handleSafeExit(ws.userId, battleId);
                        ws.send(JSON.stringify({ 
                            type: 'safe_exit_ack', 
                            ok: res.ok, 
                            message: res.message, 
                            battleId 
                        }));
                    } catch (err) {
                        console.error('safe_exit error', err);
                        ws.send(JSON.stringify({ 
                            type: 'safe_exit_ack', 
                            ok: false, 
                            message: '服务器错误' 
                        }));
                    }
                    break;

                case 'match_join':
                    if (!ws.userId) return;

                    const {
                        difficulty = 'easy'
                    } = data;

                    // 检查用户信誉分
                    const user = users.get(ws.userId);
                    if (!user) {
                        ws.send(JSON.stringify({
                            type: 'match_status',
                            status: 'error',
                            message: '用户信息不存在'
                        }));
                        return;
                    }
                    // 检查信誉分是否达到最低要求
                    const userCredit = user.credit || 100;
                    if (userCredit < 95) {
                        ws.send(JSON.stringify({
                            type: 'match_status',
                            status: 'error',
                            message: `信誉分不足，当前信誉分 ${userCredit}，需要至少 95 分才能进行对战`
                        }));
                        return;
                    }

                    const targetQueue = matchQueue[difficulty];

                    // 加入队列
                    if (!targetQueue.includes(ws.userId)) {
                        targetQueue.push(ws.userId);
                    }

                    // 发送匹配状态
                    ws.send(JSON.stringify({
                        type: 'match_status',
                        status: 'waiting',
                        message: `已加入${getDifficultyText(difficulty)}难度匹配队列`,
                        queueCount: targetQueue.length,
                        onlineCount: userWsMap.size
                    }));

                    // 查找对手
                    const opponentIndex = findOpponentInQueue(ws.userId, difficulty);
                    if (opponentIndex !== -1) {
                        const opponentId = targetQueue.splice(opponentIndex, 1)[0];
                        const currentUserIndex = targetQueue.indexOf(ws.userId);
                        if (currentUserIndex !== -1) {
                            targetQueue.splice(currentUserIndex, 1);
                        }

                        // 创建对战
                        const battleId = `battle-${uuidv4()}`;
                        const battleQuestions = getRandomQuestions(difficulty, 5);

                        // 获取对手连接
                        const opponentWs = userWsMap.get(opponentId);
                        if (!opponentWs) {
                            ws.send(JSON.stringify({
                                type: 'match_status',
                                status: 'error',
                                message: '对手已离开'
                            }));
                            return;
                        }

                        // 创建对战数据
                        const battle = {
                            id: battleId,
                            difficulty: difficulty,
                            state: BattleState.WAITING,
                            startTime: null,
                            endTime: null,
                            players: [{
                                    userId: ws.userId,
                                    score: 0,
                                    progress: 0,
                                    answers: []
                                },
                                {
                                    userId: opponentId,
                                    score: 0,
                                    progress: 0,
                                    answers: []
                                }
                            ],
                            questions: battleQuestions
                        };

                        battles.set(battleId, battle);

                        // 通知双方匹配成功
                        const selfUser = users.get(ws.userId);
                        const opponentUser = users.get(opponentId);

                        ws.send(JSON.stringify({
                            type: 'match_found',
                            battleId,
                            difficulty: difficulty,
                            opponent: opponentUser.username,
                            questions: battle.questions
                        }));

                        opponentWs.send(JSON.stringify({
                            type: 'match_found',
                            battleId,
                            difficulty: difficulty,
                            opponent: selfUser.username,
                            questions: battle.questions
                        }));
                        //处理匹配成功后的逻辑
                        setTimeout(() => {
                            const battle = battles.get(battleId);
                            // 只有在对战仍然存在且处于 WAITING 状态时才正式开始
                            if (battle && battle.state === BattleState.WAITING) {
                                battle.state = BattleState.PLAYING;
                                battle.startTime = new Date().toISOString();
                                battles.set(battleId, battle);

                                // 通知双方开始对战
                                ws.send(JSON.stringify({
                                    type: 'battle_start',
                                    battleId
                                }));

                                opponentWs.send(JSON.stringify({
                                    type: 'battle_start',
                                    battleId
                                }));
                            }
                        }, 3000); // 3秒后开始对战
                    }
                    break;

                case 'match_cancel':
                    if (!ws.userId) return;
                    Object.values(matchQueue).forEach(queue => {
                        const index = queue.indexOf(ws.userId);
                        if (index !== -1) {
                            queue.splice(index, 1);
                        }
                    });
                    ws.send(JSON.stringify({
                        type: 'match_status',
                        status: 'cancelled',
                        message: '已取消匹配'
                    }));
                    break;

                case 'battle_ready':
                    if (data.battleId) {
                        ws.currentBattleId = data.battleId;
                    }
                    break;

                case 'answer_progress':
                    if (!ws.userId || !data.battleId) return;

                    const battle = battles.get(data.battleId);
                    if (!battle || battle.state !== BattleState.PLAYING) return;

                    const {
                        questionIndex, answer, timeTaken
                    } = data; // 移除score，由服务端计算
                    const question = battle.questions[questionIndex];
                    const isCorrect = answer === question.answer;

                    // 服务端重新计算分数（防止客户端作弊）
                    const calculatedScore = isCorrect ?
                        calculateScore(timeTaken, battle.difficulty) : 0;

                    console.log(`答题得分计算: 玩家 ${ws.userId}, 题目 ${questionIndex}, 用时 ${timeTaken}ms, 正确 ${isCorrect}, 得分 ${calculatedScore}`);

                    // 更新玩家进度
                    const playerIndex = battle.players.findIndex(p => p.userId === ws.userId);
                    if (playerIndex !== -1) {
                        battle.players[playerIndex].progress = questionIndex + 1;
                        battle.players[playerIndex].answers[questionIndex] = {
                            answer,
                            correct: isCorrect,
                            timeTaken,
                            score: calculatedScore // 使用服务端计算的分数
                        };

                        // 计算当前总分
                        const currentScore = battle.players[playerIndex].answers.reduce((sum, a) => sum + (a.score || 0), 0);

                        // 检测单玩家是否已答完全部题
                        const playerObj = battle.players[playerIndex];
                        const answeredLen = (playerObj.answers || []).filter(a => a).length;
                        if (answeredLen === battle.questions.length && !playerObj.finished) {
                            playerObj.finished = true;
                            playerObj.finishedAt = new Date().toISOString();
                            // 持久化立即保存玩家答题记录
                            await persistBattles();

                            // 给玩家推送"已完成，可安全退出"的提示
                            const finishNotice = {
                                type: 'player_finished',
                                battleId: data.battleId,
                                message: '你已完成全部题目，可以选择安全退出（保存答题记录）或继续等待对手。'
                            };
                            
                            const psWs = userWsMap.get(playerObj.userId);
                            if (psWs && psWs.readyState === WebSocket.OPEN) {
                                psWs.send(JSON.stringify(finishNotice));
                            } else {
                                pushPendingBattleNotification(playerObj.userId, finishNotice);
                            }
                        }

                        battles.set(data.battleId, battle);

                        // 广播进度更新
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN &&
                                (client.userId === battle.players[0].userId || client.userId === battle.players[1].userId)) {
                                client.send(JSON.stringify({
                                    type: 'battle_update',
                                    battleId: data.battleId,
                                    playerId: ws.userId,
                                    progress: battle.players[playerIndex].progress,
                                    score: currentScore
                                }));
                            }
                        });

                        // 检查对战是否完成
                        checkBattleCompletion(data.battleId);
                    }
                    break;
                
                case 'chat_message':
                    console.log('收到聊天消息:', data);

                    if (!ws.userId) {
                        ws.send(JSON.stringify({
                            type: 'chat_error',
                            message: '未登录，无法发送消息'
                        }));
                        return;
                    }

                    const {
                        toUserId, content
                    } = data;

                    if (!toUserId || !content) {
                        ws.send(JSON.stringify({
                            type: 'chat_error',
                            message: '缺少接收用户ID或消息内容'
                        }));
                        return;
                    }

                    // 检查是否是好友
                    const userFriends = friends.get(ws.userId) || [];
                    if (!userFriends.includes(toUserId)) {
                        ws.send(JSON.stringify({
                            type: 'chat_error',
                            message: '不是好友，无法发送消息'
                        }));
                        return;
                    }

                    // 创建消息对象
                    const messageObj = {
                        id: `msg-${uuidv4()}`,
                        from: ws.userId,
                        to: toUserId,
                        content: content,
                        timestamp: new Date().toISOString()
                    };

                    // 保存消息到聊天记录
                    const chatKey = getChatKey(ws.userId, toUserId);
                    const messages = chatMessages.get(chatKey) || [];
                    messages.push(messageObj);
                    chatMessages.set(chatKey, messages);

                    // 持久化聊天记录
                    await persistFriendData();

                    // 发送给接收方
                    const toUserWs = userWsMap.get(toUserId);
                    if (toUserWs && toUserWs.readyState === WebSocket.OPEN) {
                        toUserWs.send(JSON.stringify({
                            type: 'chat_message',
                            message: messageObj
                        }));
                        console.log(`消息已转发给 ${toUserId}`);
                    } else {
                        console.log(`用户 ${toUserId} 不在线，消息已保存`);
                    }

                    // 也发送给自己（用于确认发送成功）
                    ws.send(JSON.stringify({
                        type: 'chat_message_sent',
                        message: messageObj
                    }));

                    console.log(`消息已发送: ${ws.userId} -> ${toUserId}`);
                    break;

                default:
                    //heartbeat日志
                    // console.log('未知消息类型：', data.type);
            }
        } catch (error) {
            console.error('WebSocket消息处理错误:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: '消息处理失败'
            }));
        }
    });

    ws.on('close', () => { // 玩家断开连接时的处理
        if (ws.userId) {
            userWsMap.delete(ws.userId);

            // 移除匹配队列
            Object.values(matchQueue).forEach(queue => {
                const index = queue.indexOf(ws.userId);
                if (index !== -1) {
                    queue.splice(index, 1);
                }
            });

            // 处理所有相关对战 - 包括 WAITING 状态
            battles.forEach((battle, battleId) => {
                const disconnectedPlayer = battle.players.find(p => p.userId === ws.userId);
                if (disconnectedPlayer) {
                    console.log(`玩家 ${ws.userId} 在${battle.state}状态断开连接，对战ID: ${battleId}`);
                    
                    // 新增：如果用户已标记为 safeExited，则不要当成逃跑/惩罚
                    if (disconnectedPlayer.safeExited) {
                        console.log(`玩家 ${ws.userId} 已安全退出，不触发逃跑惩罚`);
                        // 只是持久化并删除 ws map，保持对局等待另一方继续或最终结算
                        battles.set(battleId, battle);
                        persistBattles().catch(console.error);
                        return; // 跳过后续逃跑逻辑
                    }

                    // 处理 WAITING 状态的对战（准备阶段）
                    if (battle.state === BattleState.WAITING) {
                        handleWaitingBattleDisconnect(battleId, ws.userId);
                    }
                    // 处理 PLAYING 状态的对战（答题阶段）
                    else if (battle.state === BattleState.PLAYING) {
                        const onlinePlayer = battle.players.find(p => p.userId !== ws.userId);
                        if (onlinePlayer) {
                            forceEndBattle(battleId, onlinePlayer, disconnectedPlayer);
                        }
                    }
                }
            });

            console.log(`用户 ${ws.userId} 断开连接`);
        }
    });
});


/**
 * 清理过期世界聊天消息
 */
function cleanupWorldChatMessages() {
    const now = new Date();
    worldChatMessages = worldChatMessages.filter(msg => 
        new Date(msg.expiresAt) > now
    );
}

/**
 * 启动世界聊天清理定时器
 */
function startWorldChatCleanup() {
    // 每5分钟清理一次过期消息
    worldChatCleanupTimer = setInterval(() => {
        cleanupWorldChatMessages();
        console.log(`世界聊天消息清理完成，当前消息数: ${worldChatMessages.length}`);
    }, 5 * 60 * 1000);
}






// ===============================
// 统计和数据分析API
// ===============================

/**
 * 获取用户对战答题统计
 */
app.get('/api/user/battle-stats', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    let totalQuestions = 0;
    let correctAnswers = 0;

    // 遍历所有对战记录
    battles.forEach(battle => {
        if (battle.state === BattleState.FINISHED) {
            const player = battle.players.find(p => p.userId === userId);
            if (player && player.answers) {
                totalQuestions += player.answers.length;
                correctAnswers += player.answers.filter(answer => answer.correct).length;
            }
        }
    });

    const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions * 100).toFixed(1) : 0;

    res.json({
        totalQuestions,
        correctAnswers,
        accuracy: parseFloat(accuracy),
        totalBattles: Array.from(battles.values()).filter(battle =>
            battle.state === BattleState.FINISHED &&
            battle.players.some(p => p.userId === userId)
        ).length
    });
});

/**
 * 获取指定对战的详细答题情况
 */
app.get('/api/battles/:id/stats', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const battle = battles.get(req.params.id);
    if (!battle) {
        return res.status(404).json({
            error: '对战不存在'
        });
    }

    const player = battle.players.find(p => p.userId === req.session.userId);
    if (!player) {
        return res.status(403).json({
            error: '无权访问此对战'
        });
    }

    const totalQuestions = player.answers.length;
    const correctAnswers = player.answers.filter(answer => answer.correct).length;
    const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions * 100).toFixed(1) : 0;

    res.json({
        battleId: battle.id,
        difficulty: battle.difficulty,
        totalQuestions,
        correctAnswers,
        accuracy: parseFloat(accuracy),
        answers: player.answers.map((answer, index) => ({
            questionIndex: index,
            question: battle.questions[index].content,
            userAnswer: answer.answer,
            correctAnswer: battle.questions[index].answer,
            isCorrect: answer.correct,
            timeTaken: answer.timeTaken,
            score: answer.score
        }))
    });
});

/**
 * 导出错题本为 Markdown
 */
app.get('/api/error-bank/export', (req, res) => {
    console.log('收到错题本导出请求');

    if (!req.session.userId) {
        console.log('用户未登录');
        return res.status(401).json({
            error: '未登录'
        });
    }

    try {
        const userId = req.session.userId;
        const errors = errorBank.get(userId) || [];

        console.log(`用户 ${userId} 的错题数量: ${errors.length}`);

        if (errors.length === 0) {
            return res.status(400).json({
                error: '错题本为空'
            });
        }

        // 构建 Markdown 内容
        let markdownContent = '# 错题本\n\n';
        markdownContent += `导出时间：${new Date().toLocaleString('zh-CN')}\n`;
        markdownContent += `错题数量：${errors.length}\n\n`;
        markdownContent += '---\n\n';

        errors.forEach((error, index) => {
            // 查找原始题目信息
            const originalQuestion = questions.find(q => q.id === error.questionId);

            markdownContent += `## 第 ${index + 1} 题\n\n`;
            markdownContent += `**题目：** ${error.content || originalQuestion?.content || '题目内容缺失'}\n\n`;

            // 添加选项信息（如果有且不是填空题）
            if (originalQuestion?.options && originalQuestion.options.length > 0 && originalQuestion.type !== 'fill') {
                markdownContent += `**选项：**\n`;
                originalQuestion.options.forEach((option, optIndex) => {
                    const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D...
                    markdownContent += `${optionLabel}. ${option}\n`;
                });
                markdownContent += `\n`;
            }

            markdownContent += `**你的答案：** ${error.userAnswer || '未作答'}\n\n`;
            markdownContent += `**正确答案：** ${error.correctAnswer || '答案缺失'}\n\n`;
            markdownContent += `**解析：** ${error.analysis || originalQuestion?.analysis || '暂无解析'}\n\n`;
            markdownContent += `**题型：** ${originalQuestion?.type || error.type || '未知'}\n\n`;
            markdownContent += `**难度：** ${getDifficultyText(error.difficulty || originalQuestion?.difficulty)}\n\n`;
            markdownContent += `**错误时间：** ${new Date(error.timestamp).toLocaleString('zh-CN')}\n\n`;
            markdownContent += '---\n\n';
        });

        console.log('Markdown 内容生成完成，长度:', markdownContent.length);

        // 设置响应头
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', 'attachment; filename=errorbook.md');

        // 发送内容
        res.send(markdownContent);
        console.log('响应发送成功');

    } catch (error) {
        console.error('导出错题本时发生错误:', error);
        res.status(500).json({
            error: '服务器内部错误: ' + error.message
        });
    }
});

/**
 * 清空错题本
 */
app.delete('/api/error-bank/clear', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    try {
        errorBank.set(req.session.userId, []);
        await persistErrorBank();
        res.json({
            success: true,
            message: '错题本已清空'
        });
    } catch (err) {
        res.status(500).json({
            error: '清空错题本失败'
        });
    }
});


// ===============================
// 世界聊天功能
// ===============================

/**
 * 启动世界聊天清理定时器
 */
function startWorldChatCleanup() {
    // 每5分钟清理一次过期消息
    worldChatCleanupTimer = setInterval(() => {
        cleanupWorldChatMessages();
        console.log(`世界聊天消息清理完成，当前消息数: ${worldChatMessages.length}`);
    }, 5 * 60 * 1000);
}

/**
 * 清理过期世界聊天消息
 */
function cleanupWorldChatMessages() {
    const now = new Date();
    worldChatMessages = worldChatMessages.filter(msg => 
        new Date(msg.expiresAt) > now
    );
}

// ===============================
// 敏感词过滤系统
// ===============================

let sensitiveWords = [];

/**
 * 加载敏感词列表
 */
async function loadSensitiveWords() {
    try {
        console.log('正在加载敏感词列表...');
        
        // 检查文件是否存在
        await fs.access(SENSITIVE_WORDS_PATH);
        
        // 读取文件内容
        const fileContent = await fs.readFile(SENSITIVE_WORDS_PATH, 'utf8');
        
        // 按行分割并过滤空行
        const lines = fileContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        console.log(`找到 ${lines.length} 个敏感词条目`);
        
        // 解码每个敏感词
        sensitiveWords = [];
        for (const line of lines) {
            try {
                // 从Base64解码
                const decoded = Buffer.from(line, 'base64').toString('utf8');
                if (decoded && decoded.trim().length > 0) {
                    sensitiveWords.push(decoded.trim());
                }
            } catch (decodeError) {
                console.warn(`解码敏感词失败: ${line}`, decodeError);
            }
        }
        
        console.log(`成功加载 ${sensitiveWords.length} 个敏感词`);
        console.log('敏感词示例:', sensitiveWords.slice(0, 5)); // 打印前5个作为示例
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('敏感词文件不存在，使用默认敏感词列表');
            // 文件不存在时使用默认敏感词
            sensitiveWords = [
                '敏感词1', '敏感词2', '违禁词', 'badword', '测试敏感词'
            ];
        } else {
            console.error('加载敏感词文件失败:', error);
            // 出错时使用默认敏感词
            sensitiveWords = [
                '敏感词1', '敏感词2', '违禁词', 'badword', '测试敏感词'
            ];
        }
    }
}

/**
 * 过滤敏感词
 * @param {string} content 原始内容
 * @returns {string} 过滤后的内容
 */
function filterSensitiveWords(content) {
    if (!content || typeof content !== 'string') {
        return content || '';
    }
    
    let filteredContent = content;
    
    // 如果敏感词列表为空，尝试重新加载
    if (sensitiveWords.length === 0) {
        console.log('敏感词列表为空，尝试重新加载...');
        loadSensitiveWords().catch(console.error);
        return content; // 暂时返回原内容
    }
    
    // 对每个敏感词进行过滤
    sensitiveWords.forEach(word => {
        if (word && word.length > 0) {
            try {
                // 创建正则表达式进行全局替换
                const regex = new RegExp(escapeRegExp(word), 'gi');
                filteredContent = filteredContent.replace(regex, '***');
            } catch (regexError) {
                console.warn(`创建敏感词正则表达式失败: ${word}`, regexError);
            }
        }
    });
    
    // 如果内容被修改，记录日志（生产环境可以去掉）
    if (filteredContent !== content) {
        console.log(`敏感词过滤: "${content}" -> "${filteredContent}"`);
    }
    
    return filteredContent;
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 发送世界聊天消息
 */
app.post('/api/world-chat/send', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: '未登录' });
    }

    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '消息内容不能为空' });
    }

    if (content.length > 500) {
        return res.status(400).json({ error: '消息长度不能超过500字符' });
    }

    try {
        const user = users.get(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 过滤敏感词
        const filteredContent = filterSensitiveWords(content.trim());

        // 创建消息对象
        const message = {
            id: `world-msg-${uuidv4()}`,
            userId: user.id,
            username: user.username,
            content: filteredContent,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30分钟后过期
        };

        // 添加到消息列表
        worldChatMessages.push(message);

        // 广播给所有在线用户
        const broadcastData = {
            type: 'world_chat_message',
            message: message
        };

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(broadcastData));
            }
        });

        res.json({ 
            success: true, 
            message: '消息发送成功',
            filteredContent: filteredContent
        });

    } catch (error) {
        console.error('发送世界聊天消息错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

/**
 * 获取世界聊天历史消息
 */
app.get('/api/world-chat/history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: '未登录' });
    }

    try {
        // 清理过期消息
        cleanupWorldChatMessages();

        // 返回最近100条消息，按时间倒序
        const recentMessages = worldChatMessages
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 100);

        res.json(recentMessages);
    } catch (error) {
        console.error('获取世界聊天历史错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

/**
 * 获取世界聊天在线人数
 */
app.get('/api/world-chat/online-count', (req, res) => {
    res.json({ 
        onlineCount: userWsMap.size,
        timestamp: new Date().toISOString()
    });
});






// ===============================
// 好友功能API
// ===============================

/**
 * 获取所有用户（用于通过用户名查找）
 */
app.get('/api/users', (req, res) => {
    const userArray = Array.from(users.values()).map(user => ({
        id: user.id,
        username: user.username,
        score: user.score
    }));
    res.json(userArray);
});

/**
 * 发送好友申请
 */
app.post('/api/friend-request', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        toUserId,
        message
    } = req.body;
    const fromUserId = req.session.userId;

    if (!toUserId) {
        return res.status(400).json({
            error: '缺少目标用户ID'
        });
    }

    // 不能添加自己为好友
    if (fromUserId === toUserId) {
        return res.status(400).json({
            error: '不能添加自己为好友'
        });
    }

    // 检查目标用户是否存在
    const toUser = users.get(toUserId);
    if (!toUser) {
        return res.status(404).json({
            error: '目标用户不存在'
        });
    }

    // 检查是否已经是好友
    const userFriends = friends.get(fromUserId) || [];
    if (userFriends.includes(toUserId)) {
        return res.status(400).json({
            error: '已经是好友'
        });
    }

    // 检查是否已经发送过申请
    const existingRequests = friendRequests.get(toUserId) || [];
    const hasPendingRequest = existingRequests.some(req =>
        req.fromUserId === fromUserId && req.status === FriendRequestStatus.PENDING
    );

    if (hasPendingRequest) {
        return res.status(400).json({
            error: '已经发送过好友申请'
        });
    }

    // 创建好友申请
    const request = {
        id: `friend-request-${uuidv4()}`,
        fromUserId,
        toUserId,
        message: message || '',
        status: FriendRequestStatus.PENDING,
        createdAt: new Date().toISOString()
    };

    // 保存申请
    friendRequests.set(toUserId, [...existingRequests, request]);
    await persistFriendData();

    // 通知目标用户
    const toUserWs = userWsMap.get(toUserId);
    if (toUserWs) {
        toUserWs.send(JSON.stringify({
            type: 'friend_request_received',
            request: {
                ...request,
                fromUsername: users.get(fromUserId).username
            }
        }));
    }

    res.json({
        success: true,
        message: '好友申请已发送'
    });
});

/**
 * 获取好友申请列表
 */
app.get('/api/friend-requests', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const requests = friendRequests.get(userId) || [];

    // 补充申请者信息
    const enrichedRequests = requests.map(request => {
        const fromUser = users.get(request.fromUserId);
        return {
            ...request,
            fromUsername: fromUser ? fromUser.username : '未知用户'
        };
    });

    res.json(enrichedRequests);
});

/**
 * 处理好友申请
 */
app.post('/api/friend-request/respond', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const {
        requestId,
        action
    } = req.body;
    const userId = req.session.userId;

    if (!requestId || !action) {
        return res.status(400).json({
            error: '缺少参数'
        });
    }

    // 找到申请
    const requests = friendRequests.get(userId) || [];
    const requestIndex = requests.findIndex(req => req.id === requestId);

    if (requestIndex === -1) {
        return res.status(404).json({
            error: '好友申请不存在'
        });
    }

    const request = requests[requestIndex];

    if (action === 'accept') {
        // 添加好友关系
        const userFriends = friends.get(userId) || [];
        const fromUserFriends = friends.get(request.fromUserId) || [];

        if (!userFriends.includes(request.fromUserId)) {
            userFriends.push(request.fromUserId);
            friends.set(userId, userFriends);
        }

        if (!fromUserFriends.includes(userId)) {
            fromUserFriends.push(userId);
            friends.set(request.fromUserId, fromUserFriends);
        }

        // 更新申请状态
        requests[requestIndex].status = FriendRequestStatus.ACCEPTED;
        friendRequests.set(userId, requests);

        await persistFriendData();

        // 通知申请者
        const fromUserWs = userWsMap.get(request.fromUserId);
        if (fromUserWs) {
            fromUserWs.send(JSON.stringify({
                type: 'friend_request_accepted',
                fromUserId: userId,
                username: users.get(userId).username
            }));
        }

        res.json({
            success: true,
            message: '已接受好友申请'
        });

    } else if (action === 'reject') {
        // 更新申请状态
        requests[requestIndex].status = FriendRequestStatus.REJECTED;
        friendRequests.set(userId, requests);
        await persistFriendData();

        res.json({
            success: true,
            message: '已拒绝好友申请'
        });
    } else {
        res.status(400).json({
            error: '无效的操作'
        });
    }
});

/**
 * 获取好友列表
 */
app.get('/api/friends', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const friendIds = friends.get(userId) || [];

    // 补充好友信息
    const friendList = friendIds.map(friendId => {
        const friend = users.get(friendId);
        return {
            id: friendId,
            username: friend ? friend.username : '未知用户',
            online: userWsMap.has(friendId), // 在线状态
            score: friend ? friend.score : 0,
            wins: friend ? friend.wins : 0,
            losses: friend ? friend.losses : 0
        };
    });

    res.json(friendList);
});

/**
 * 获取聊天记录
 */
app.get('/api/chat/:friendId', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: '未登录'
        });
    }

    const userId = req.session.userId;
    const friendId = req.params.friendId;

    // 检查是否是好友
    const userFriends = friends.get(userId) || [];
    if (!userFriends.includes(friendId)) {
        return res.status(403).json({
            error: '不是好友，无法查看聊天记录'
        });
    }

    // 获取聊天记录
    const chatKey = getChatKey(userId, friendId);
    const messages = chatMessages.get(chatKey) || [];

    res.json(messages);
});

// ===============================
// 调试和默认路由
// ===============================

app.use((req, res, next) => {
    console.log('=== Session 调试 ===');
    console.log('请求路径:', req.path);
    console.log('Session ID:', req.sessionID);
    console.log('Session 数据:', req.session);
    console.log('==================');
    next();
});

// 默认路由，返回 index.html
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ===============================
// 服务器启动
// ===============================

/**
 * 启动服务器
 */
async function startServer() {
    await initData();
    
    server.listen(PORT, HOST, () => {
        console.log('🚀 服务器启动成功!');
        console.log('================================');
        console.log(`📍 本地访问: http://localhost:${PORT}`);
        console.log(`🌐 公网访问: http://120.55.75.154:${PORT}`);
        console.log(`🌐 域名访问: http://你的域名`); // 如果将来绑定域名
        console.log('================================');
    });
}

// 启动服务器
startServer().catch(console.error);

// 优雅关闭
// process.on('SIGINT', () => {
//     console.log('\n🛑 正在关闭服务器...');
//     server.close(() => {
//         console.log('✅ 服务器已关闭');
//         process.exit(0);
//     });
// });