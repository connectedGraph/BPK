
// 显示排行榜标签页
function showLeaderboardTab(tab) {
    // 隐藏所有内容
    document.querySelectorAll('.leaderboard-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // 移除所有标签激活状态
    document.querySelectorAll('.leaderboard-tab').forEach(tabEl => {
        tabEl.classList.remove('active');
    });
    
    // 显示选中内容
    const targetContent = document.getElementById(`leaderboard${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    const targetTab = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    
    if (targetContent && targetTab) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
        targetTab.classList.add('active');
        currentLeaderboardTab = tab;
        
        // 加载对应榜单数据
        loadLeaderboardData(tab);
    }
}

// 显示难度子标签
function showDifficultyRanking(difficulty) {
    currentDifficultyTab = difficulty;
    
    // 更新子标签激活状态
    document.querySelectorAll('.difficulty-subtab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 加载难度榜单数据
    loadDifficultyRanking(difficulty);
}
// 加载排行榜数据
async function loadLeaderboardData(type) {
    try {
        let url = '';
        
        switch(type) {
            case 'score':
                url = '/api/leaderboard/score';
                break;
            case 'winRate':
                url = '/api/leaderboard/win-rate';
                break;
            case 'streak':
                url = '/api/leaderboard/streak';
                break;
            case 'friends':
                url = '/api/leaderboard/friends';
                break;
            case 'difficulty':
                await loadDifficultyRanking(currentDifficultyTab);
                return;
        }
        
        const res = await axios.get(url);
        renderLeaderboardList(type, res.data);
        
    } catch (err) {
        console.error('加载排行榜失败:', err);
        showToast('加载排行榜失败', 'error');
    }
}

// 加载难度排行榜
async function loadDifficultyRanking(difficulty) {
    try {
        const res = await axios.get(`/api/leaderboard/difficulty/${difficulty}`);
        renderDifficultyList(res.data);
    } catch (err) {
        console.error('加载难度排行榜失败:', err);
        showToast('加载难度排行榜失败', 'error');
    }
}

// 渲染排行榜列表
function renderLeaderboardList(type, data) {
    const containerId = `${type}RankingList`;
    const container = document.getElementById(containerId);
    
    if (!container) return;
    
    if (data.length === 0) {
        container.innerHTML = '<div class="no-data">暂无数据</div>';
        return;
    }
    
    const currentUserId = currentUser?.id;
    
    container.innerHTML = data.map(item => {
        const isCurrentUser = item.userId === currentUserId;
        const userClass = isCurrentUser ? 'ranking-item current-user' : 'ranking-item';
        
        switch(type) {
            case 'score':
                return `
                    <div class="${userClass}">
                        <div class="rank-number rank-${item.rank}">${item.rank}</div>
                        <div class="player-info">
                            <div class="player-avatar">${item.username.charAt(0).toUpperCase()}</div>
                            <div>
                                <div class="player-name">${item.username}</div>
                                <div class="battle-count">${item.totalBattles}场</div>
                            </div>
                        </div>
                        <div class="rank-value" style="color: #ed8936;">${item.score}</div>
                        <div class="rank-value">${item.wins}/${item.losses}</div>
                    </div>
                `;
                
            case 'winRate':
                const winRateClass = item.winRate >= 70 ? 'win-rate-high' : 
                                   item.winRate >= 50 ? 'win-rate-medium' : 'win-rate-low';
                return `
                    <div class="${userClass}">
                        <div class="rank-number rank-${item.rank}">${item.rank}</div>
                        <div class="player-info">
                            <div class="player-avatar">${item.username.charAt(0).toUpperCase()}</div>
                            <div class="player-name">${item.username}</div>
                        </div>
                        <div class="rank-value ${winRateClass}">${item.winRate}%</div>
                        <div class="rank-value">${item.totalBattles}场</div>
                    </div>
                `;
                
            case 'streak':
                return `
                    <div class="${userClass}">
                        <div class="rank-number rank-${item.rank}">${item.rank}</div>
                        <div class="player-info">
                            <div class="player-avatar">${item.username.charAt(0).toUpperCase()}</div>
                            <div class="player-name">${item.username}</div>
                        </div>
                        <div class="rank-value" style="color: #e53e3e;">${item.currentStreak}连胜</div>
                        <div class="rank-value">最高${item.maxStreak}</div>
                    </div>
                `;
                
            case 'friends':
                return `
                    <div class="${userClass}">
                        <div class="rank-number rank-${item.rank}">${item.rank}</div>
                        <div class="player-info">
                            <div class="player-avatar">${item.username.charAt(0).toUpperCase()}</div>
                            <div>
                                <div class="player-name">${item.username}</div>
                                <div class="${item.online ? 'online-status' : 'offline-status'}">${item.online ? '在线' : '离线'}</div>
                            </div>
                        </div>
                        <div class="rank-value" style="color: #ed8936;">${item.score}</div>
                        <div class="rank-value">${item.wins}/${item.losses}</div>
                    </div>
                `;
        }
    }).join('');
}

// 渲染难度排行榜
function renderDifficultyList(data) {
    const container = document.getElementById('difficultyRankingList');
    
    if (!container) return;
    
    if (data.length === 0) {
        container.innerHTML = '<div class="no-data">暂无数据</div>';
        return;
    }
    
    const currentUserId = currentUser?.id;
    
    container.innerHTML = data.map(item => {
        const isCurrentUser = item.userId === currentUserId;
        const userClass = isCurrentUser ? 'ranking-item current-user' : 'ranking-item';
        const winRateClass = item.winRate >= 70 ? 'win-rate-high' : 
                           item.winRate >= 50 ? 'win-rate-medium' : 'win-rate-low';
        
        return `
            <div class="${userClass}">
                <div class="rank-number rank-${item.rank}">${item.rank}</div>
                <div class="player-info">
                    <div class="player-avatar">${item.username.charAt(0).toUpperCase()}</div>
                    <div class="player-name">${item.username}</div>
                </div>
                <div class="rank-value">${item.difficultyWins}胜</div>
                <div class="rank-value ${winRateClass}">${item.winRate}%</div>
            </div>
        `;
    }).join('');
}

// 刷新排行榜
function refreshLeaderboard() {
    loadLeaderboardData(currentLeaderboardTab);
    resetRefreshTimer();
    // showToast('排行榜已刷新', 'success');
}

// 重置刷新计时器
function resetRefreshTimer() {
    let countdown = 5;
    const countdownEl = document.getElementById('refreshCountdown');
    
    if (leaderboardRefreshTimer) {
        clearInterval(leaderboardRefreshTimer);
    }
    
    leaderboardRefreshTimer = setInterval(() => {
        countdown--;
        if (countdownEl) {
            countdownEl.textContent = countdown;
        }
        
        if (countdown <= 0) {
            refreshLeaderboard();
        }
    }, 1000);
}

// 初始化排行榜
function initLeaderboard() {
    if (document.getElementById('gameSection-leaderboard').classList.contains('active')) {
        loadLeaderboardData('score');
        resetRefreshTimer();
    }
}