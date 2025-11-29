
// 加载信誉分信息
/**
 * 加载信誉分信息
 */
async function loadCreditInfo() {
    try {
        const res = await axios.get(`${baseUrl}/user/credit`);
        const creditInfo = res.data;
        
        const creditInfoEl = document.getElementById('creditInfo');
        creditInfoEl.innerHTML = `
            <div class="credit-score-display">
                <div class="credit-value ${creditInfo.canJoinBattle ? 'good' : 'bad'}">
                    ${creditInfo.credit} 分
                </div>
                <div class="credit-status">
                    ${creditInfo.canJoinBattle ? '✅ 可以参与对战' : '❌ 无法参与对战'}
                </div>
            </div>
            <div class="credit-details">
                <div class="credit-detail-item">
                    <span class="label">最低对战要求:</span>
                    <span class="value">${creditInfo.minCreditForBattle} 分</span>
                </div>
                <div class="credit-detail-item">
                    <span class="label">每日恢复上限:</span>
                    <span class="value">${creditInfo.dailyRecovery} 分</span>
                </div>
                <div class="credit-detail-item">
                    <span class="label">今日剩余恢复:</span>
                    <span class="value">${creditInfo.remainingRecovery} 分</span>
                </div>
                <div class="credit-detail-item">
                    <span class="label">逃跑次数:</span>
                    <span class="value">${creditInfo.escapes || 0} 次</span>
                </div>
                <div class="credit-detail-item">
                    <span class="label">消极比赛:</span>
                    <span class="value">${creditInfo.negativeGames || 0} 次</span>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('加载信誉分信息失败:', error);
        document.getElementById('creditInfo').innerHTML = '<div class="error">加载信誉分信息失败</div>';
    }
}


// 显示信誉历史模态框
/**
 * 显示信誉分历史记录
 */
async function showCreditHistory() {
    try {
        const res = await axios.get(`${baseUrl}/user/credit-history`);
        const data = res.data;
        
        const modal = document.getElementById('creditHistoryModal');
        const currentCreditEl = document.getElementById('currentCreditValue');
        const historyList = document.getElementById('creditHistoryList');
        
        // 更新当前信誉分
        currentCreditEl.textContent = data.credit;
        
        // 清空历史列表
        historyList.innerHTML = '';
        
        if (!data.history || data.history.length === 0) {
            historyList.innerHTML = '<div class="no-history">暂无信誉分历史记录</div>';
            return;
        }
        
        // 显示历史记录
        data.history.forEach(record => {
            // 正确判断是扣分还是加分
            const isPenalty = record.change < 0;
            const changeValue = Math.abs(record.change); // 显示绝对值
            const type = isPenalty ? 'penalty' : 'reward';
            
            const item = document.createElement('div');
            item.className = `credit-history-item ${type}`;
            item.innerHTML = `
                <div class="credit-change ${type}">
                    ${type === 'penalty' ? '➖' : '➕'} 
                    ${changeValue}分
                </div>
                <div class="credit-reason">${record.reason || '未知原因'}</div>
                <div class="credit-time">${new Date(record.timestamp).toLocaleString('zh-CN')}</div>
                <div class="credit-current">当前信誉分: ${record.currentCredit || data.credit}分</div>
            `;
            historyList.appendChild(item);
        });
        
        // 显示模态框
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('获取信誉分历史失败:', error);
        showToast('获取信誉分历史失败', 'error');
    }
}

// 关闭信誉历史模态框
function closeCreditHistoryModal() {
    document.getElementById('creditHistoryModal').style.display = 'none';
}




// 更新用户信息展示
async function updateUserInfo() {
    try {
        const res = await axios.get(`${baseUrl}/user`);
        currentUser = res.data;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // 获取信誉分信息
        let creditInfo = {
            credit: currentUser.credit || 100
        };
        try {
            const creditRes = await axios.get(`${baseUrl}/user/credit`);
            creditInfo = creditRes.data;
        } catch (err) {
            console.log('获取信誉分详情失败，使用基本信息');
        }

        const userInfo = document.getElementById('userInfo');
        userInfo.innerHTML = `
      用户名：<strong>${currentUser.username}</strong> | 
      积分：<span style="color: #ed8936; font-weight: bold;">${currentUser.score}</span> | 
      信誉分：<span style="color: ${creditInfo.credit >= 95 ? '#48bb78' : '#e53e3e'}; font-weight: bold;">${creditInfo.credit}</span> | 
      胜场：<span style="color: #48bb78; font-weight: bold;">${currentUser.wins}</span> | 
      败场：<span style="color: #e53e3e; font-weight: bold;">${currentUser.losses}</span>
      ${creditInfo.credit < 95 ? '<span style="color: #e53e3e;">(信誉分不足，无法对战)</span>' : ''}
    `;
    } catch (err) {
        console.error('更新用户信息失败:', err);
        localStorage.removeItem('currentUser');
        showToast('用户信息验证失败，请重新登录', 'error');
        showModule('loginModule');
    }
}
// 加载个人资料数据 - 更新连胜显示
async function loadProfileData() {
    try {
        const userRes = await axios.get(`${baseUrl}/user`);
        const userData = userRes.data;

        currentUser = userData;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        document.getElementById('profileUsername').textContent = userData.username;
        document.getElementById('profileEmail').textContent = userData.email || '未设置';
        document.getElementById('profileScore').textContent = userData.score || 0;
        document.getElementById('profileWins').textContent = userData.wins || 0;
        document.getElementById('profileLosses').textContent = userData.losses || 0;

        const totalBattles = (userData.wins || 0) + (userData.losses || 0);
        document.getElementById('profileTotalBattles').textContent = totalBattles;

        const winRate = totalBattles > 0 ? Math.round((userData.wins / totalBattles) * 100) : 0;
        document.getElementById('profileWinRate').textContent = `${winRate}%`;

        // 新增连胜数据显示
        document.getElementById('profileCurrentStreak').textContent = userData.currentStreak || 0;
        document.getElementById('profileMaxStreak').textContent = userData.maxStreak || 0;

        renderStreakAchievements(userData.currentStreak || 0, userData.maxStreak || 0);
        // 加载对战历史
        await loadBattleHistory();
        await loadCreditInfo();

    } catch (err) {
        console.error('加载个人资料失败:', err);
        showToast('加载个人资料失败', 'error');

        document.getElementById('profileUsername').textContent = '加载失败';
        document.getElementById('profileEmail').textContent = '加载失败';
        document.getElementById('battleHistoryList').innerHTML = '<p style="text-align: center; color: #e53e3e;">加载失败，请刷新重试</p>';
    }
}
// 加载对战历史
async function loadBattleHistory() {
    try {
        const res = await axios.get(`${baseUrl}/battle-history`);
        const battles = res.data;
        const battleHistoryList = document.getElementById('battleHistoryList');

        if (battles.length === 0) {
            battleHistoryList.innerHTML = '<p style="text-align: center; color: #718096; padding: 20px;">暂无对战记录</p>';
            return;
        }

        battleHistoryList.innerHTML = '';
        battles.slice(0, 10).forEach((battle, index) => { // 只显示最近10场
            const battleItem = document.createElement('div');
            battleItem.className = 'battle-history-item';

            const isWinner = battle.winnerId === currentUser.id;
            const isDraw = battle.resultType === 'draw';
            const opponent = battle.players.find(p => p.id !== currentUser.id);

            let resultText, resultColor;
            if (isDraw) {
                resultText = '平局';
                resultColor = '#ed8936';
            } else if (isWinner) {
                resultText = '胜利';
                resultColor = '#48bb78';
            } else {
                resultText = '失败';
                resultColor = '#e53e3e';
            }

            battleItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>对战 ${index + 1}</strong>
                    <span style="color: ${resultColor}; font-weight: bold;">${resultText}</span>
                </div>
                <div style="font-size: 14px; color: #718096;">
                    <div>对手: ${opponent ? opponent.username : '未知用户'}</div>
                    <div>难度: ${getDifficultyText(battle.difficulty)} | 得分: ${battle.userScore || 0}</div>
                    <div>时间: ${new Date(battle.endTime).toLocaleString('zh-CN')}</div>
                </div>
                <hr style="margin: 10px 0; border: none; border-top: 1px solid #e2e8f0;">
            `;

            battleHistoryList.appendChild(battleItem);
        });

    } catch (err) {
        console.error('加载对战历史失败:', err);
        document.getElementById('battleHistoryList').innerHTML = '<p style="text-align: center; color: #e53e3e;">加载失败</p>';
    }
}
// 渲染连胜成就 - 确保这个函数正确定义
function renderStreakAchievements(currentStreak, maxStreak) {
    const container = document.getElementById('streakAchievements');
    if (!container) {
        console.log('连胜成就容器未找到');
        return;
    }

    console.log('渲染连胜成就:', {
        currentStreak,
        maxStreak
    });

    const achievements = [{
            streak: 3,
            name: '初露锋芒',
            icon: '🔥'
        },
        {
            streak: 5,
            name: '势如破竹',
            icon: '⚡'
        },
        {
            streak: 10,
            name: '所向披靡',
            icon: '🏆'
        },
        {
            streak: 15,
            name: '战无不胜',
            icon: '👑'
        },
        {
            streak: 20,
            name: '传奇王者',
            icon: '💎'
        },
        {
            streak: 50,
            name: 'GOD',
            icon: '😎'
        }
    ];

    container.innerHTML = achievements.map(achievement => {
        const achieved = maxStreak >= achievement.streak;
        const current = currentStreak >= achievement.streak;
        const badgeClass = achieved ? 'achievement-badge' : 'achievement-badge locked';
        const status = current ? ' (进行中)' : achieved ? ' (已达成)' : '';

        return `
            <div class="${badgeClass}">
                <span>${achievement.icon}</span>
                <span>${achievement.name}</span>
                <small>${achievement.streak}连胜${status}</small>
            </div>
        `;
    }).join('');
}

// 修改个人信息
async function updateProfile() {
    const newUsername = document.getElementById('editUsername').value.trim();
    const newEmail = document.getElementById('editEmail').value.trim();

    if (!newUsername) {
        showToast('用户名不能为空', 'error');
        return;
    }

    if (newEmail && !/^[\w.-]+@[a-zA-Z0-9-]+\.[a-zA-Z]+$/.test(newEmail)) {
        showToast('邮箱格式不正确', 'error');
        return;
    }

    try {
        const res = await axios.put(`${baseUrl}/user/profile`, {
            username: newUsername,
            email: newEmail
        });

        showToast('个人信息更新成功', 'success');
        closeEditProfileModal();

        // 更新当前用户信息
        currentUser = res.data.user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        await loadProfileData();
        await updateUserInfo(); // 更新顶部用户信息

    } catch (err) {
        showToast('更新失败: ' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

// 修改密码
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('请填写所有密码字段', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('新密码至少6位', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('两次输入的新密码不一致', 'error');
        return;
    }

    try {
        const res = await axios.put(`${baseUrl}/user/password`, {
            currentPassword: currentPassword,
            newPassword: newPassword
        });

        showToast('密码修改成功', 'success');
        closeChangePasswordModal();
        // 清空密码表单
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';

    } catch (err) {
        showToast('密码修改失败: ' + (err.response?.data?.error || '当前密码错误'), 'error');
    }
}