const baseUrl = `${window.location.origin}/api`;
// 创建配置好的axios实例
const api = axios.create({
    baseURL: baseUrl,
    withCredentials: true // 关键：所有请求都携带cookie
});

// 存储未读的对局通知
let unreadBattleNotifications = [];

// 初始化WebSocket连接
function initWebSocket() {
    if (!currentUser || ws) return;
    if (reconnectCount >= maxReconnectCount) {
        showToast('连接失败次数过多，请刷新页面重试', 'error');
        return;
    }

    // 修复：动态获取WebSocket地址
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    console.log('正在连接WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket连接成功');
        reconnectCount = 0;
        ws.send(JSON.stringify({
            type: 'auth',
            userId: currentUser.id
        }));
                // 重连成功后，显示所有未读的逃跑惩罚通知
        if (unreadEscapeNotifications.length > 0) {
            unreadEscapeNotifications.forEach(notification => {
                showEscapePenaltyNotification(notification);
            });
            // 清空未读列表（避免重复显示）
            unreadEscapeNotifications = [];
        }
        
        // 新增：处理未读的对局保存通知
        if (window.unreadBattleNotifications && window.unreadBattleNotifications.length > 0) {
            window.unreadBattleNotifications.forEach(notification => {
                if (typeof showBattleSavedNotification === 'function') {
                    showBattleSavedNotification(notification);
                }
            });
            window.unreadBattleNotifications = [];
        }
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMsg(data);
    };

    ws.onclose = (event) => {
        console.log('WebSocket连接关闭：', event.code, event.reason);
        ws = null;
        if (currentUser && event.code !== 1000) {
            reconnectCount++;
            setTimeout(initWebSocket, reconnectCount * 1000);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket错误：', err);
        ws.close();
    };
}

// 处理WebSocket消息
function handleWebSocketMsg(data) {
    console.log('收到WebSocket消息:', data);

    switch (data.type) {
        case 'match_status':
            const matchStatus = document.getElementById('matchStatus');
            matchStatus.textContent = data.message;
            matchStatus.className = 'msg info';
            if (data.onlineCount) {
                matchStatus.textContent += `（当前在线：${data.onlineCount}人）`;
            }
            break;

        case 'match_found':
            // 重要：在开始新对局前彻底重置状态
            resetBattleState();
            
            battleId = data.battleId;
            currentBattleId = data.battleId;
            questions = data.questions;
            document.getElementById('opponentName').textContent = data.opponent;

            // 发送准备通知
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'battle_ready',
                    battleId: battleId
                }));
            }

            // 显示对战模块
            document.getElementById('matchModule').style.display = 'none';
            document.getElementById('battleModule').style.display = 'block';
            document.getElementById('resultModule').style.display = 'none';

            // 重要：匹配成功后隐藏导航栏
            toggleBottomNav(false);
            // 倒计时开始
            startCountdown();
            break;

        case 'battle_start':
            showCurrentQuestion();
            break;

        case 'battle_update':
            if (data.playerId !== currentUser.id) {
                document.getElementById('opponentScore').textContent = data.score;
            } else {
                document.getElementById('myScore').textContent = data.score;
            }
            break;

        case 'battle_end':
            console.log('收到对战结束消息');
            // 如果是准备阶段逃跑，显示特殊提示
            if (data.waitingPhase) {
                if (data.result.winner === currentUser.id) {
                    showToast('对手在准备阶段逃跑，你获得胜利！', 'success');
                } else {
                    showToast('你在准备阶段断开连接，被判逃跑！', 'error');
                }
            }
            showBattleResult(data);
            break;

        case 'heartbeat_ack':
            break;
        case 'world_chat_message':
            console.log('收到世界聊天消息:', data.message);
            if (typeof handleWorldChatMessage === 'function') {
                handleWorldChatMessage(data.message);
            }
            break;
        case 'friend_request_received':
            // 显示通知
            const notification = document.createElement('div');
            notification.className = 'msg info';
            notification.innerHTML = `
                        收到来自 <strong>${data.request.fromUsername}</strong> 的好友申请！
                        <button onclick="showGameSection('friends')" style="margin-left: 10px; padding: 2px 8px;">查看</button>
                    `;
            document.getElementById('gameModule').insertBefore(notification, document.getElementById('gameModule').firstChild);

            // 如果正在好友页面，刷新申请列表
            if (document.getElementById('gameSection-friends').classList.contains('active')) {
                loadFriendRequests();
            }
            break;

        case 'friend_request_accepted':
            showToast(`${data.username} 接受了你的好友申请！`, 'success');
            loadFriends();
            break;

        case 'chat_message':
            // 处理聊天消息
            if (currentChatFriend &&
                (data.message.from === currentChatFriend.id || data.message.from === currentChatFriend.id)) {
                addMessageToChat(data.message);
            }
            break;

        case 'chat_error':
            showToast('聊天错误: ' + data.message, 'error');
            break;
            
        // 新增：处理逃跑惩罚通知
        case 'escape_penalty':
            // 保存到未读列表
            unreadEscapeNotifications.push(data);
            // 立即显示（当前在线时）
            showEscapePenaltyNotification(data);
            break;

        // 新增：处理玩家完成全部题目通知
        case 'player_finished':
            console.log('收到完成全部题目通知');
            showSafeExitButton();
            showToast('你已完成全部题目！可以选择安全退出保存记录，或等待对手完成。', 'success');
            break;

        // 新增：处理安全退出确认
        case 'safe_exit_ack':
            if (data.ok) {
                showToast('安全退出成功！对局数据已保存。', 'success');
                hideSafeExitButton();
                
                // 可选：自动跳转到个人资料页面
                setTimeout(() => {
                    showGameSection('profile');
                }, 2000);
            } else {
                showToast(`安全退出失败: ${data.message}`, 'error');
            }
            break;

        // 新增：处理对战保存通知
        case 'battle_saved':
            console.log('收到对战保存通知');
            showBattleSavedNotification(data);
            hideSafeExitButton();
            break;

        default:
            // heartbeat 日志
            // console.log('未知消息类型：', data.type); 
    }
}