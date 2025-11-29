// 控制导航栏显示/隐藏
function toggleBottomNav(show) {
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
        if (show) {
            bottomNav.style.display = 'flex';
        } else {
            bottomNav.style.display = 'none';
        }
    }
}
//--------------------
// 重置对战状态函数
function resetBattleState() {
    console.log('彻底重置对战状态');
    
    // 重置所有全局变量
    currentQuestionIndex = 0;
    battleId = null;
    currentBattleId = null;
    questions = [];
    selectedDifficulty = null;
    opponentUserId = null;
    
    // 清除所有计时器
    clearTimeout(matchTimer);
    clearInterval(answerTimer);
    matchTimer = null;
    answerTimer = null;
    
    // 重置UI状态
    document.getElementById('myScore').textContent = '0';
    document.getElementById('opponentScore').textContent = '0';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('countdown').textContent = '';
    document.getElementById('answerTime').textContent = '';
    
    // 重置题目区域
    document.getElementById('questionArea').innerHTML = '';
    document.getElementById('optionArea').innerHTML = '';
    
    // 重置按钮状态
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.backgroundColor = '';
    });
    
    document.getElementById('joinMatchBtn').disabled = true;
    document.getElementById('joinMatchBtn').style.display = 'inline-block';
    document.getElementById('cancelMatchBtn').style.display = 'none';
    document.getElementById('matchStatus').textContent = '';
    
    // 重置模块显示
    document.getElementById('matchModule').style.display = 'block';
    document.getElementById('battleModule').style.display = 'none';
    document.getElementById('resultModule').style.display = 'none';
    
    // 重要：重置时显示导航栏
    toggleBottomNav(true);
    
    console.log('对战状态重置完成');
}

 function selectDifficulty(difficulty) {
     document.querySelectorAll('.difficulty-btn').forEach(btn => {
         btn.classList.remove('selected');
         btn.style.backgroundColor = '';
     });
     selectedDifficulty = difficulty;
     const selectedBtn = document.getElementById(`${difficulty}Btn`);
     selectedBtn.classList.add('selected');
     switch (difficulty) {
         case 'easy':
             selectedBtn.style.backgroundColor = '#48bb78';
             break;
         case 'medium':
             selectedBtn.style.backgroundColor = '#ed8936';
             break;
         case 'hard':
             selectedBtn.style.backgroundColor = '#e53e3e';
             break;
     }
     document.getElementById('joinMatchBtn').disabled = false;
 }

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
 async function showBattleResult(data) {
     console.log('显示对战结果:', data);
     const resultDetail = document.getElementById('resultDetail');
     const isWinner = data.result.type === 'win' && data.result.winner === currentUser.id;
     const isDraw = data.result.type === 'draw';
     const myScore = data.scores[currentUser.id];
     const opponentScore = Object.values(data.scores).find(score => score !== myScore) || 0;
     let realAccuracy = 0;
     try {
         const statsRes = await axios.get(`${baseUrl}/battles/${data.battleId}/stats`);
         realAccuracy = statsRes.data.accuracy;
     } catch (err) {
         console.log('获取真实正确率失败，使用估算值');
         const maxPossibleScore = questions.length * 100;
         realAccuracy = maxPossibleScore > 0 ? (myScore / maxPossibleScore * 100).toFixed(1) : 0;
     }
     let resultHTML = '';
     if (isDraw) {
         resultHTML = ` <p><strong>对战难度：</strong>${getDifficultyText(data.difficulty)}</p> <p class="draw">🤝 平局！</p> <p>你的得分：<span style="font-size:24px;color:#4299e1;">${myScore}</span></p> <p>对手得分：<span style="font-size:24px;color:#e53e3e;">${opponentScore}</span></p> <p>积分变动：<span style="color:#ed8936;">+5</span></p> <p>答题正确率：<span style="font-weight:bold;">${realAccuracy}%</span></p> `;
     } else if (isWinner) {
         resultHTML = ` <p><strong>对战难度：</strong>${getDifficultyText(data.difficulty)}</p> <p class="win">🎉 恭喜你获胜！</p> <p>你的得分：<span style="font-size:24px;color:#4299e1;">${myScore}</span></p> <p>对手得分：<span style="font-size:24px;color:#e53e3e;">${opponentScore}</span></p> <p>积分变动：<span style="color:#48bb78;">+${data.scoreChange||10}</span></p> <p>答题正确率：<span style="font-weight:bold;">${realAccuracy}%</span></p> `;
     } else {
         resultHTML = ` <p><strong>对战难度：</strong>${getDifficultyText(data.difficulty)}</p> <p class="lose">💔 很遗憾你失败了</p> <p>你的得分：<span style="font-size:24px;color:#4299e1;">${myScore}</span></p> <p>对手得分：<span style="font-size:24px;color:#e53e3e;">${opponentScore}</span></p> <p>积分变动：<span style="color:#e53e3e;">-${Math.floor((data.scoreChange||10)/ 2)}</span></p> <p>答题正确率：<span style="font-weight:bold;">${realAccuracy}%</span></p> `;
     }
     resultDetail.innerHTML = resultHTML;
     document.getElementById('battleModule').style.display = 'none';
     document.getElementById('resultModule').style.display = 'block';
     document.getElementById('matchModule').style.display = 'none';
     updateUserInfo();
     console.log('已切换到结果页面');
     const opponent = data.result.type === 'win' ? (data.result.winner === currentUser.id ? data.result.loser : data.result.winner) : Object.keys(data.scores).find(userId => userId !== currentUser.id);
     opponentUserId = opponent;
     const addFriendBtn = document.getElementById('addFriendBtn');
     if (opponent && opponent !== currentUser.id) {
         addFriendBtn.style.display = 'inline-block';
     } else {
         console.log('隐藏加好友按钮');
         addFriendBtn.style.display = 'none';
     }
 }
 async function getBattleDetail() {
     if (!currentBattleId) {
         showToast('暂无对战详情', 'success');
         return;
     }
     try {
         const res = await axios.get(`${baseUrl}/battles/${currentBattleId}`);
         const detail = res.data;
         showToast(`对战详情加载成功！\n对战ID:${detail.id}\n开始时间:${new Date(detail.startTime).toLocaleString()}`, 'success');
     } catch (err) {
         showToast('获取对战详情失败：' + (err.response?.data?.error || '网络错误'), 'error');
     }
 }
 async function joinMatch() {
     try {
         const creditRes = await axios.get(`${baseUrl}/user/credit`);
         if (!creditRes.data.canJoinBattle) {
             showToast(`信誉分不足${creditRes.data.minCreditForBattle}，无法参与对战。当前信誉分：${creditRes.data.credit}`, 'error');
             return;
         }
     } catch (err) {
         showToast('检查信誉分失败，请重试', 'error');
         return;
     }
     if (!ws || !selectedDifficulty) {
         showToast('请先选择对战难度', 'error');
         return;
     }
     ws.send(JSON.stringify({
         type: 'match_join',
         difficulty: selectedDifficulty
     }));
     const matchStatus = document.getElementById('matchStatus');
     matchStatus.textContent = `正在寻找${getDifficultyText(selectedDifficulty)}难度对手...`;
     matchStatus.className = 'msg info';
     document.getElementById('joinMatchBtn').style.display = 'none';
     document.getElementById('cancelMatchBtn').style.display = 'inline-block';
     matchTimer = setTimeout(() => {
         cancelMatch();
         matchStatus.textContent = `匹配超时，请重新发起`;
         matchStatus.className = 'msg error';
     }, 30000);
 }

function cancelMatch() {
    if (ws) {
        ws.send(JSON.stringify({
            type: 'match_cancel'
        }));
    }
    
    // 重置状态
    resetBattleState();
    
    document.getElementById('matchStatus').textContent = '已取消匹配';
    document.getElementById('matchStatus').className = 'msg info';
    clearTimeout(matchTimer);
}

function startCountdown() {
    // 确保题目区域是空的
    document.getElementById('questionArea').innerHTML = '';
    document.getElementById('optionArea').innerHTML = '';
    document.getElementById('countdown').style.color = '#4299e1';
    
    let count = 3;
    const countdownEl = document.getElementById('countdown');
    countdownEl.textContent = `对战即将开始！${count}秒`;
    
    const timer = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(timer);
            countdownEl.textContent = '对战开始！';
            setTimeout(() => {
                countdownEl.textContent = '';
                // 确保重置当前题目索引
                currentQuestionIndex = 0;
                showCurrentQuestion();
            }, 1000);
        } else {
            countdownEl.textContent = `对战即将开始！${count}秒`;
        }
    }, 1000);
}

 function handleTimeout() {
     const question = questions[currentQuestionIndex];
     if (question.answered) return;
     if (question.type === 'multi') {
         const selectedCheckboxes = document.querySelectorAll('input[name="multiOption"]:checked');
         if (selectedCheckboxes.length > 0) {
             submitMultiAnswer();
         } else {
             submitAnswer('', null, true);
         }
     } else {
         submitAnswer('', null, true);
     }
 }

 function showCurrentQuestion() {
    if (!questions || questions.length === 0) {
        console.warn('没有题目数据，无法显示');
        return;
    }
    if (currentQuestionIndex >= questions.length) {
        document.getElementById('questionArea').innerHTML = '所有题目已答完，等待对手完成...';
        document.getElementById('optionArea').innerHTML = '';
        return;
    }
     if (currentQuestionIndex >= questions.length) {
         document.getElementById('questionArea').innerHTML = '所有题目已答完，等待对手完成...';
         document.getElementById('optionArea').innerHTML = '';
         return;
     }
     const question = questions[currentQuestionIndex];
     question.startTime = Date.now();
     const questionEl = document.getElementById('questionArea');
     const optionEl = document.getElementById('optionArea');
     const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
     document.getElementById('progressBar').style.width = `${progress}%`;
     questionEl.innerHTML = `<span class="question-number">${currentQuestionIndex + 1}/${questions.length}</span> ${question.content}`;
     renderMathJaxDelayed(questionEl);
     if (question.type === 'fill') {
         optionEl.innerHTML = ` <input type="text" id="fillAnswer" placeholder="请输入答案"> <button onclick="submitFillAnswer()" class="option-btn">提交答案</button> `;
     } else if (question.type === 'multi') {
         optionEl.innerHTML = '';
         question.options.forEach((option, index) => {
             const optionKey = String.fromCharCode(65 + index);
             const optionDiv = document.createElement('div');
             optionDiv.className = 'multi-option';
             optionDiv.innerHTML = ` <label class="multi-option-label"> <input type="checkbox" name="multiOption" value="${optionKey}"> <span class="option-text">${optionKey}. ${option}</span> </label> `;
             optionEl.appendChild(optionDiv);
             renderMathJaxDelayed(optionDiv.querySelector('.option-text'));
         });
         const submitBtn = document.createElement('button');
         submitBtn.className = 'option-btn submit-multi-btn';
         submitBtn.textContent = '提交多选题答案';
         submitBtn.onclick = submitMultiAnswer;
         optionEl.appendChild(submitBtn);
     } else {
         optionEl.innerHTML = '';
         question.options.forEach((option, index) => {
             const optionKey = String.fromCharCode(65 + index);
             const btn = document.createElement('button');
             btn.className = 'option-btn';
             btn.innerHTML = `${optionKey}. ${option}`;
             btn.onclick = () => submitAnswer(optionKey, btn);
             optionEl.appendChild(btn);
             renderMathJaxDelayed(btn);
         });
     }
     let timeLeft = null;
     timeLeft = DIFFICULTY_TIME_CONFIG[question.difficulty].maxTime;
     const answerTimeEl = document.getElementById('answerTime');
     answerTimeEl.textContent = `答题时间：${timeLeft}秒`;
     answerTimeEl.style.color = '#718096';
     clearInterval(answerTimer);
     answerTimer = setInterval(() => {
         timeLeft--;
         answerTimeEl.textContent = `答题时间：${timeLeft}秒`;
         if (timeLeft <= 3) {
             answerTimeEl.style.color = '#e53e3e';
         }
         if (timeLeft <= 0) {
             clearInterval(answerTimer);
             submitAnswer('', null, true);
         }
     }, 1000);
 }

function submitAnswer(answer, btn, isTimeout = false) {
    if (!questions || currentQuestionIndex >= questions.length) {
        return;
    }
    const question = questions[currentQuestionIndex];
    if (question.answered || question.type === 'multi') {
        return;
    }
    question.answered = true;
    document.querySelectorAll('.option-btn').forEach(button => {
        button.disabled = true;
        const optionKey = button.textContent.split('.')[0];
        if (optionKey === question.answer) {
            button.classList.add('correct');
        } else if (button === btn && !isTimeout) {
            button.classList.add('incorrect');
        }
    });
    const startTime = question.startTime || Date.now();
    const timeTaken = Math.floor(Date.now() - startTime);
    const answerTimeEl = document.getElementById('answerTime');
    clearInterval(answerTimer);
    answerTimeEl.textContent = '';
    const isCorrect = !isTimeout && answer === question.answer;
    
    // 删除分数计算，让后端计算
    // const score = isCorrect ? calculateScore(timeTaken, question.difficulty) : 0;
    const score = 0; // 现在由后端计算分数

    if (ws) {
        ws.send(JSON.stringify({
            type: 'answer_progress',
            battleId,
            questionIndex: currentQuestionIndex,
            answer: isTimeout ? 'timeout' : answer,
            timeTaken,
            // score // 不再发送，后端会计算并返回
        }));
    }
    
    // 删除前端分数更新，等待后端推送
    // const myScoreEl = document.getElementById('myScore');
    // myScoreEl.textContent = parseInt(myScoreEl.textContent) + score;

    const countdownEl = document.getElementById('countdown');
    if (isCorrect) {
        countdownEl.textContent = `回答正确！用时${(timeTaken/1000).toFixed(1)}秒`;
        countdownEl.style.color = '#48bb78';
    } else if (isTimeout) {
        countdownEl.textContent = `答题超时！正确答案：${question.answer}`;
        countdownEl.style.color = '#e53e3e';
    } else {
        countdownEl.textContent = `回答错误！正确答案：${question.answer}`;
        countdownEl.style.color = '#e53e3e';
    }
    setTimeout(() => {
        countdownEl.textContent = '';
        currentQuestionIndex++;
        showCurrentQuestion();
    }, 1500);
}



 function submitFillAnswer() {
     const answer = document.getElementById('fillAnswer').value.trim();
     if (!answer) {
         showToast('请输入答案', 'error');
         return;
     }
     submitAnswer(answer);
 }

function submitMultiAnswer() {
    if (!questions || currentQuestionIndex >= questions.length) {
        return;
    }
    const question = questions[currentQuestionIndex];
    if (question.answered) {
        return;
    }
    const selectedCheckboxes = document.querySelectorAll('input[name="multiOption"]:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('请至少选择一个选项', 'error');
        return;
    }
    const selectedAnswers = Array.from(selectedCheckboxes).map(checkbox => checkbox.value).sort().join('');
    question.answered = true;
    document.querySelectorAll('input[name="multiOption"]').forEach(checkbox => {
        checkbox.disabled = true;
    });
    document.querySelector('.submit-multi-btn').disabled = true;
    const startTime = question.startTime || Date.now();
    const timeTaken = Math.floor(Date.now() - startTime);
    const answerTimeEl = document.getElementById('answerTime');
    clearInterval(answerTimer);
    answerTimeEl.textContent = '';
    const isCorrect = selectedAnswers === question.answer;
    
    // 删除分数计算，让后端计算
    // const score = isCorrect ? calculateMultiChoiceScore(timeTaken, question.difficulty, selectedAnswers.length) : 0;
    const score = 0; // 现在由后端计算分数

    if (ws) {
        ws.send(JSON.stringify({
            type: 'answer_progress',
            battleId,
            questionIndex: currentQuestionIndex,
            answer: selectedAnswers,
            timeTaken,
            // score // 不再发送，后端会使用自己的计算并返回
        }));
    }
    
    // 删除前端分数更新，等待后端推送
    // const myScoreEl = document.getElementById('myScore');
    // myScoreEl.textContent = parseInt(myScoreEl.textContent) + score;

    const countdownEl = document.getElementById('countdown');
    if (isCorrect) {
        countdownEl.textContent = `回答正确！用时${(timeTaken/1000).toFixed(1)}秒`;
        countdownEl.style.color = '#48bb78';
    } else {
        countdownEl.textContent = `回答错误！正确答案：${question.answer}`;
        countdownEl.style.color = '#e53e3e';
    }
    highlightMultiChoiceAnswers(question.answer, selectedAnswers);
    setTimeout(() => {
        countdownEl.textContent = '';
        currentQuestionIndex++;
        showCurrentQuestion();
    }, 2000);
}



 function highlightMultiChoiceAnswers(correctAnswer, userAnswer) {
     const correctOptions = correctAnswer.split('');
     const userOptions = userAnswer.split('');
     document.querySelectorAll('.multi-option-label').forEach(label => {
         const checkbox = label.querySelector('input');
         const optionKey = checkbox.value;
         const optionText = label.querySelector('.option-text');
         if (correctOptions.includes(optionKey)) {
             optionText.style.color = '#48bb78';
             optionText.style.fontWeight = 'bold';
         } else if (userOptions.includes(optionKey) && !correctOptions.includes(optionKey)) {
             optionText.style.color = '#e53e3e';
             optionText.style.textDecoration = 'line-through';
         }
     });
 }

// ======================= 安全退出功能 =======================

// 显示安全退出按钮
function showSafeExitButton() {
    const btn = document.getElementById('safeExitBtn');
    if (btn) {
        btn.style.display = 'inline-block';
        btn.onclick = safeExit; // 确保绑定事件
    }
}

// 隐藏安全退出按钮  
function hideSafeExitButton() {
    const btn = document.getElementById('safeExitBtn');
    if (btn) btn.style.display = 'none';
}

// 安全退出函数
function safeExit() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('无法安全退出：未连接服务器', 'error');
        return;
    }
    if (!currentBattleId) {
        showToast('无法安全退出：无对战ID', 'error');
        return;
    }

    // 发送安全退出请求
    ws.send(JSON.stringify({
        type: 'safe_exit',
        battleId: currentBattleId
    }));

    showToast('正在安全退出，保存你的答题记录...', 'success');
}

// 初始化时隐藏安全退出按钮
hideSafeExitButton();