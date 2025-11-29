// 世界聊天模块
let worldChatMessages = [];
let worldChatRefreshTimer = null;
let isWorldChatAutoScroll = true;

// 初始化世界聊天
function initWorldChat() {
    loadWorldChatHistory();
    startWorldChatRefresh();
    updateOnlineCount(); // 立即更新在线人数
    
    // 绑定发送消息事件
    const worldChatInput = document.getElementById('worldChatInput');
    const sendWorldChatBtn = document.getElementById('sendWorldChatBtn');
    
    if (worldChatInput && sendWorldChatBtn) {
        worldChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendWorldChatMessage();
            }
        });
        
        sendWorldChatBtn.addEventListener('click', sendWorldChatMessage);
    }
    
    // 绑定自动滚动切换
    const worldChatMessagesEl = document.getElementById('worldChatMessages');
    if (worldChatMessagesEl) {
        worldChatMessagesEl.addEventListener('scroll', handleWorldChatScroll);
    }
}

// 加载世界聊天历史
async function loadWorldChatHistory() {
    try {
        const response = await api.get('/world-chat/history');
        worldChatMessages = response.data;
        renderWorldChatMessages();
    } catch (error) {
        console.error('加载世界聊天历史失败:', error);
        showToast('加载聊天历史失败', 'error');
    }
}

// 渲染世界聊天消息
function renderWorldChatMessages() {
    const container = document.getElementById('worldChatMessages');
    if (!container) return;
    
    // 按时间正序排列（最新的在底部）
    const sortedMessages = [...worldChatMessages].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    container.innerHTML = sortedMessages.map(msg => `
        <div class="world-chat-message ${msg.userId === currentUser?.id ? 'own-message' : ''}">
            <div class="message-header">
                <span class="username">${escapeHtml(msg.username)}</span>
                <span class="timestamp">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
        </div>
    `).join('');
    
    // 自动滚动到底部
    if (isWorldChatAutoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// 发送世界聊天消息
async function sendWorldChatMessage() {
    const input = document.getElementById('worldChatInput');
    const btn = document.getElementById('sendWorldChatBtn');
    
    if (!input || !btn || !currentUser) {
        showToast('无法发送消息：未登录或元素不存在', 'error');
        return;
    }
    
    const content = input.value.trim();
    if (!content) {
        showToast('消息内容不能为空', 'error');
        return;
    }
    
    if (content.length > 500) {
        showToast('消息长度不能超过500字符', 'error');
        return;
    }
    
    // 禁用输入和按钮
    input.disabled = true;
    btn.disabled = true;
    btn.textContent = '发送中...';
    
    try {
        const response = await api.post('/world-chat/send', { content });
        
        if (response.data.success) {
            input.value = '';
            
            // 立即将发送的消息添加到本地显示（不等待服务器广播） 这里我们还是希望用服务器返回的消息
            // const tempMessage = {
            //     id: `temp-${Date.now()}`,
            //     userId: currentUser.id,
            //     username: currentUser.username,
            //     content: response.data.filteredContent || content,
            //     timestamp: new Date().toISOString(),
            //     isTemp: true
            // };
            
            // worldChatMessages.push(tempMessage);

            renderWorldChatMessages();
            
            showToast('消息发送成功', 'success');
        }
    } catch (error) {
        console.error('发送世界聊天消息失败:', error);
        showToast(error.response?.data?.error || '发送失败', 'error');
    } finally {
        // 重新启用输入和按钮
        input.disabled = false;
        btn.disabled = false;
        btn.textContent = '发送';
        input.focus();
    }
}

// 处理世界聊天消息（WebSocket接收）
function handleWorldChatMessage(message) {
    // 移除可能的临时消息
    worldChatMessages = worldChatMessages.filter(msg => !msg.isTemp);
    
    // 添加新消息
    worldChatMessages.push(message);
    
    // 保持最多200条消息
    if (worldChatMessages.length > 200) {
        worldChatMessages = worldChatMessages.slice(-200);
    }
    
    renderWorldChatMessages();
}

// 更新在线人数
async function updateOnlineCount() {
    try {
        const response = await api.get('/world-chat/online-count');
        const onlineCountEl = document.getElementById('worldChatOnlineCount');
        if (onlineCountEl) {
            onlineCountEl.textContent = response.data.onlineCount;
        }
    } catch (error) {
        console.error('更新在线人数失败:', error);
    }
}

// 开始世界聊天自动刷新
function startWorldChatRefresh() {
    // 每30秒更新一次在线人数
    worldChatRefreshTimer = setInterval(updateOnlineCount, 30000);
}

// 停止世界聊天自动刷新
function stopWorldChatRefresh() {
    if (worldChatRefreshTimer) {
        clearInterval(worldChatRefreshTimer);
        worldChatRefreshTimer = null;
    }
}

// 处理聊天区域滚动
function handleWorldChatScroll() {
    const container = document.getElementById('worldChatMessages');
    if (!container) return;
    
    // 如果用户手动向上滚动，暂停自动滚动
    const threshold = 100; // 距离底部的阈值
    isWorldChatAutoScroll = 
        container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

// 工具函数：转义HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 工具函数：格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
        return '刚刚';
    } else if (diff < 3600000) { // 1小时内
        return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 24小时内
        return Math.floor(diff / 3600000) + '小时前';
    } else {
        return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// 切换到世界聊天时初始化
function showWorldChatSection() {
    initWorldChat();
}

// 离开世界聊天时清理
function hideWorldChatSection() {
    stopWorldChatRefresh();
}