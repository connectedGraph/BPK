// friends-chat.js - 清理后的版本

async function addOpponentAsFriend() {
    if (!opponentUserId) {
        showToast('无法找到对手信息', 'error');
        return;
    }
    try {
        const usersRes = await axios.get(`${baseUrl}/users`);
        const opponentUser = usersRes.data.find(user => user.id === opponentUserId);
        if (!opponentUser) {
            showToast('对手信息不存在', 'error');
            return;
        }
        const message = `你好！我是${currentUser.username}，刚刚和你进行了一场精彩的对战，想加你为好友继续切磋！`;
        const res = await axios.post(`${baseUrl}/friend-request`, {
            toUserId: opponentUserId,
            message: message
        });
        showToast('好友申请已发送！', 'success');
        document.getElementById('addFriendBtn').style.display = 'none';
    } catch (err) {
        console.error('发送好友申请失败:', err);
        showToast('发送好友申请失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

async function sendFriendRequest() {
    const username = document.getElementById('friendUsername').value.trim();
    const message = document.getElementById('friendRequestMessage').value.trim();
    if (!username) {
        showToast('请输入对方用户名', 'error');
        return;
    }
    try {
        const usersRes = await axios.get(`${baseUrl}/users`);
        const targetUser = usersRes.data.find(user => user.username === username);
        if (!targetUser) {
            showToast('用户不存在', 'error');
            return;
        }
        if (targetUser.id === currentUser.id) {
            showToast('不能添加自己为好友', 'error');
            return;
        }
        const res = await axios.post(`${baseUrl}/friend-request`, {
            toUserId: targetUser.id,
            message: message
        });
        showToast('好友申请已发送！', 'success');
        closeAddFriendModal();
    } catch (err) {
        console.error('发送好友申请失败:', err);
        showToast('发送好友申请失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

async function loadFriends() {
    try {
        const res = await axios.get(`${baseUrl}/friends`);
        const friends = res.data;
        const friendsList = document.getElementById('friendsList');
        if (friends.length === 0) {
            friendsList.innerHTML = '<p style="text-align:center;color:#718096;">暂无好友</p>';
            return;
        }
        friendsList.innerHTML = '';
        friends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.className = `friend-item ${friend.online?'online':'offline'}`;
            friendItem.innerHTML = ` 
                <strong>${friend.username}</strong> 
                <div style="font-size:14px;color:#718096;"> 
                    ${friend.online?'🟢 在线':'⚫ 离线'} | 积分:${friend.score} | 胜率:${friend.wins + friend.losses > 0?Math.round((friend.wins /(friend.wins + friend.losses))* 100):0}% 
                </div> 
            `;
            friendsList.appendChild(friendItem);
        });
    } catch (err) {
        console.error('加载好友列表失败:', err);
    }
}

async function loadFriendRequests() {
    try {
        console.log('开始加载好友申请...');
        const res = await axios.get(`${baseUrl}/friend-requests`);
        console.log('好友申请数据:', res.data);
        const requestsContainer = document.getElementById('friendRequests');
        if (!requestsContainer) {
            console.error('错误:找不到好友申请容器');
            return;
        }
        requestsContainer.innerHTML = '';
        requestsContainer.style.minHeight = '200px';
        requestsContainer.style.padding = '20px';
        requestsContainer.style.border = '2px dashed #e2e8f0';
        requestsContainer.style.borderRadius = '8px';
        const pendingRequests = res.data.filter(req => req.status === 'pending');
        console.log('待处理申请数量:', pendingRequests.length);
        if (pendingRequests.length === 0) {
            requestsContainer.innerHTML = ` 
                <div style="text-align:center;color:#718096;padding:40px;"> 
                    <div style="font-size:48px;margin-bottom:10px;">📭</div> 
                    <h3>暂无好友申请</h3> 
                    <p>当有人向你发送好友申请时，会显示在这里</p> 
                </div> 
            `;
            return;
        }
        const listContainer = document.createElement('div');
        listContainer.style.width = '100%';
        pendingRequests.forEach((request, index) => {
            console.log(`创建申请项 ${index + 1}:`, request);
            const requestItem = document.createElement('div');
            requestItem.style.cssText = ` 
                background:white;
                border:2px solid #e2e8f0;
                border-radius:12px;
                padding:20px;
                margin:15px 0;
                display:flex;
                justify-content:space-between;
                align-items:center;
                box-shadow:0 2px 8px rgba(0,0,0,0.1);
                transition:all 0.3s ease;
            `;
            requestItem.onmouseover = () => {
                requestItem.style.borderColor = '#4299e1';
                requestItem.style.boxShadow = '0 4px 12px rgba(66,153,225,0.2)';
            };
            requestItem.onmouseout = () => {
                requestItem.style.borderColor = '#e2e8f0';
                requestItem.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            };
            requestItem.innerHTML = ` 
                <div style="flex:1;"> 
                    <div style="display:flex;align-items:center;margin-bottom:8px;"> 
                        <div style="width:40px;height:40px;background:#4299e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;margin-right:12px;"> 
                            ${request.fromUsername?.charAt(0)?.toUpperCase()||'?'}
                        </div> 
                        <div> 
                            <h4 style="margin:0;color:#2d3748;font-size:18px;">${request.fromUsername}</h4> 
                            <div style="font-size:12px;color:#718096;margin-top:2px;"> 
                                ${new Date(request.createdAt).toLocaleString('zh-CN')}
                            </div> 
                        </div> 
                    </div> 
                    <div style="color:#4a5568;font-size:14px;line-height:1.4;background:#f7fafc;padding:12px;border-radius:6px;margin:8px 0;"> 
                        ${request.message||'想添加您为好友'}
                    </div> 
                </div> 
                <div style="display:flex;gap:10px;margin-left:20px;"> 
                    <button onclick="respondToFriendRequest('${request.id}','accept')" style="background:#48bb78;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;transition:background 0.3s;"> 
                        ✓ 接受 
                    </button> 
                    <button onclick="respondToFriendRequest('${request.id}','reject')" style="background:#e53e3e;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;transition:background 0.3s;"> 
                        ✗ 拒绝 
                    </button> 
                </div> 
            `;
            listContainer.appendChild(requestItem);
        });
        requestsContainer.appendChild(listContainer);
        console.log('好友申请列表加载完成');
    } catch (err) {
        console.error('加载好友申请失败:', err);
        const requestsContainer = document.getElementById('friendRequests');
        if (requestsContainer) {
            requestsContainer.innerHTML = ` 
                <div style="text-align:center;color:#e53e3e;padding:40px;"> 
                    <div style="font-size:48px;margin-bottom:10px;">❌</div> 
                    <h3>加载失败</h3> 
                    <p>${err.response?.data?.error||'网络错误，请刷新重试'}</p> 
                    <button onclick="loadFriendRequests()" style="background:#4299e1;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin-top:10px;"> 
                        重新加载 
                    </button> 
                </div> 
            `;
        }
    }
}

async function respondToFriendRequest(requestId, action) {
    try {
        console.log(`处理好友申请:${requestId},动作:${action}`);
        const res = await axios.post(`${baseUrl}/friend-request/respond`, {
            requestId: requestId,
            action: action
        });
        showToast(action === 'accept' ? '已接受好友申请' : '已拒绝好友申请', 'success');
        await loadFriendRequests();
        await loadFriends();
    } catch (err) {
        console.error('处理好友申请失败:', err);
        showToast('操作失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

function showAddFriendModal() {
    document.getElementById('addFriendModal').style.display = 'flex';
}

function closeAddFriendModal() {
    document.getElementById('addFriendModal').style.display = 'none';
    document.getElementById('friendUsername').value = '';
    document.getElementById('friendRequestMessage').value = '';
}

async function loadChatFriends() {
    try {
        const res = await axios.get(`${baseUrl}/friends`);
        const friends = res.data;
        const chatFriendsList = document.getElementById('chatFriendsList');
        
        if (friends.length === 0) {
            chatFriendsList.innerHTML = '<p style="text-align:center;color:#718096;padding:10px;">暂无好友</p>';
            return;
        }
        
        friends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.className = `chat-friend-item ${friend.online ? 'online' : 'offline'}`;
            friendItem.innerHTML = `
                <strong>${friend.username}</strong>
                <div style="font-size:12px;color:#718096;">${friend.online ? '在线' : '离线'}</div>
            `;
            friendItem.onclick = () => {
                selectChatFriend(friend);
            };
            chatFriendsList.appendChild(friendItem);
        });
        
    } catch (err) {
        console.error('加载聊天好友失败:', err);
    }
}

async function selectChatFriend(friend) {
    currentChatFriend = friend;
    document.querySelectorAll('.chat-friend-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.chat-friend-item').classList.add('active');
    
    // 更新聊天标题
    document.getElementById('chatWithUser').textContent = `与 ${friend.username} 聊天`;
    
    // 启用输入框
    document.getElementById('chatInput').disabled = false;
    document.getElementById('sendChatBtn').disabled = false;
    
    // 加载聊天记录
    await loadChatMessages(friend.id);
}

async function loadChatMessages(friendId) {
    try {
        const res = await axios.get(`${baseUrl}/chat/${friendId}`);
        const messages = res.data;
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        messages.forEach(message => {
            addMessageToChat(message, false);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
        console.error('加载聊天记录失败:', err);
    }
}

async function sendChatMessage() {
    if (!currentChatFriend) {
        showToast('请先选择聊天好友', 'error');
        return;
    }
    
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    
    if (!content) {
        showToast('请输入消息内容', 'error');
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat_message',
            toUserId: currentChatFriend.id,
            content: content
        }));
        input.value = '';
    } else {
        showToast('连接已断开，请刷新页面', 'error');
    }
    
    await loadChatMessages(currentChatFriend.id);
}

function addMessageToChat(message, isNew = true) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    const isOwn = message.from === currentUser.id;
    messageDiv.className = `chat-message ${isOwn?'own':'other'}`;
    const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
    messageDiv.innerHTML = ` 
        <div>${message.content}</div> 
        <div class="message-time">${time}</div> 
    `;
    chatMessages.appendChild(messageDiv);
    if (isNew) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}