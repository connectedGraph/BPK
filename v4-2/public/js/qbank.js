// 题库相关功能 - 重构优化版

// 使用全局变量，不重复声明
// currentQuestionBankTab 已经在其他地方声明了

let allQuestions = []; // 全局题目数据缓存

// ===============================
// 初始化函数
// ===============================

/**
 * 初始化题目数据
 */
async function initQuestionData() {
    try {
        const res = await axios.get(`${baseUrl}/questions`);
        allQuestions = res.data;
        console.log(`✅ 加载了 ${allQuestions.length} 道题目数据`);
    } catch (err) {
        console.error('❌ 加载题目数据失败:', err);
        showToast('加载题目数据失败', 'error');
    }
}

/**
 * 从缓存中查找题目详情
 */
function findQuestionDetail(questionId) {
    return allQuestions.find(q => q.id === questionId) || null;
}

// ===============================
// 题库标签页管理
// ===============================

/**
 * 显示题库标签页
 */
function showQuestionBankTab(tab) {
    // 使用全局的 currentQuestionBankTab
    window.currentQuestionBankTab = tab;

    // 隐藏所有内容
    document.querySelectorAll('.question-bank-content').forEach(content => {
        content.style.display = 'none';
    });

    // 移除所有标签激活状态
    document.querySelectorAll('.leaderboard-tab').forEach(tabEl => {
        tabEl.classList.remove('active');
    });

    // 显示选中内容
    const targetContent = document.getElementById(`questionBank${capitalizeFirst(tab)}`);
    const targetTab = document.getElementById(`tab${capitalizeFirst(tab)}Bank`);

    if (targetContent && targetTab) {
        targetContent.style.display = 'block';
        targetTab.classList.add('active');

        // 加载对应题库数据
        loadQuestionBankData(tab);
        updateQuestionBankButtons(tab);
    }
}

/**
 * 更新题库操作按钮
 */
function updateQuestionBankButtons(tab) {
    const clearBtn = document.getElementById('clearBankBtn');
    if (!clearBtn) return;

    if (tab === 'error') {
        clearBtn.style.display = 'inline-block';
        clearBtn.textContent = '清空错题';
        clearBtn.onclick = clearErrorBank;
    } else {
        clearBtn.style.display = 'inline-block';
        clearBtn.textContent = '清空收藏';
        clearBtn.onclick = clearFavoriteBank;
    }
}

// ===============================
// 题库数据加载
// ===============================

/**
 * 加载题库数据
 */
async function loadQuestionBankData(type) {
    try {
        if (type === 'error') {
            await loadErrorBankData();
        } else {
            await loadFavoriteBankData();
        }
        await updateQuestionBankStats(type);
    } catch (err) {
        console.error('加载题库数据失败:', err);
        showToast('加载题库数据失败', 'error');
    }
}

/**
 * 加载错题题库
 */
async function loadErrorBankData() {
    try {
        showLoadingState('errorList', '正在加载错题...');
        
        const res = await axios.get(`${baseUrl}/error-bank`);
        const errors = res.data;
        
        // 确保题目数据已加载
        if (allQuestions.length === 0) {
            await initQuestionData();
        }
        
        const errorList = document.getElementById('errorList');
        
        if (errors.length === 0) {
            showEmptyState(errorList, '暂无错题，继续加油！');
            return;
        }
        
        // 丰富错题数据
        const enrichedErrors = errors.map(error => ({
            ...error,
            knowledgePoints: findQuestionDetail(error.questionId)?.title || ''
        }));
        
        renderQuestionList(errorList, enrichedErrors, 'error');
        
    } catch (err) {
        handleDataLoadError('errorList', '获取错题本失败', err);
    }
}

/**
 * 加载收藏题库
 */
async function loadFavoriteBankData() {
    try {
        showLoadingState('favoriteList', '正在加载收藏题目...');
        
        const res = await axios.get(`${baseUrl}/favorite-questions`);
        const favorites = res.data;
        
        // 确保题目数据已加载
        if (allQuestions.length === 0) {
            await initQuestionData();
        }
        
        const favoriteList = document.getElementById('favoriteList');
        
        if (favorites.length === 0) {
            showEmptyState(favoriteList, '暂无收藏题目');
            return;
        }
        
        // 丰富收藏数据
        const enrichedFavorites = favorites.map(favorite => ({
            ...favorite,
            knowledgePoints: findQuestionDetail(favorite.questionId)?.title || ''
        }));
        
        renderQuestionList(favoriteList, enrichedFavorites, 'favorite');
        
    } catch (err) {
        handleDataLoadError('favoriteList', '获取收藏题目失败', err);
    }
}

// ===============================
// 题目渲染相关
// ===============================

/**
 * 渲染题目列表
 */
function renderQuestionList(container, questions, type) {
    container.innerHTML = '';
    
    questions.forEach((questionData) => {
        const questionItem = createQuestionItem(questionData, type);
        container.appendChild(questionItem);
        
        // 延迟渲染数学公式
        setTimeout(() => {
            renderMathJaxForQuestion(questionItem);
        }, 100);
    });
}

/**
 * 创建题目项DOM
 */
function createQuestionItem(questionData, type) {
    const item = document.createElement('div');
    item.className = `question-item ${type === 'favorite' ? 'favorite' : ''}`;
    
    item.innerHTML = `
        <div class="question-header">
            <div class="question-content">${questionData.content || '题目内容加载中...'}</div>
        </div>
        ${createOptionsHTML(questionData)}
        ${createAnswerHTML(questionData, type)}
        ${createKnowledgeHTML(questionData)}
        <div class="question-analysis">
            <strong>解析：</strong>${questionData.analysis || '暂无解析'}
        </div>
        <div class="question-meta">
            <div class="question-info">
                <span>题型：${questionData.type} | 难度：${getDifficultyText(questionData.difficulty)}</span>
            </div>
            <div class="question-actions">
                ${createActionButton(questionData, type)}
            </div>
        </div>
        <hr class="question-divider">
    `;
    
    return item;
}

/**
 * 创建选项HTML
 */
function createOptionsHTML(questionData) {
    if (!questionData.options || questionData.options.length === 0 || questionData.type === 'fill') {
        return '';
    }
    
    const optionsHTML = questionData.options.map((option, index) => {
        const optionLabel = String.fromCharCode(65 + index);
        return `<div class="question-option"><strong>${optionLabel}.</strong> ${option}</div>`;
    }).join('');
    
    return `<div class="question-options">${optionsHTML}</div>`;
}

/**
 * 创建答案HTML
 */
function createAnswerHTML(questionData, type) {
    if (type === 'error') {
        return `
            <div class="question-answer">
                <strong>你的答案：</strong><span class="user-answer">${questionData.userAnswer}</span> | 
                <strong>正确答案：</strong><span class="correct-answer">${questionData.correctAnswer}</span>
            </div>
        `;
    } else {
        return `
            <div class="question-answer">
                <strong>正确答案：</strong><span class="correct-answer">${questionData.answer}</span>
            </div>
        `;
    }
}

/**
 * 创建知识点HTML
 */
function createKnowledgeHTML(questionData) {
    if (!questionData.knowledgePoints) return '';
    
    return `
        <div class="question-knowledge">
            <strong>考察知识点：</strong><span class="knowledge-points">${questionData.knowledgePoints}</span>
        </div>
    `;
}

/**
 * 创建操作按钮
 */
function createActionButton(questionData, type) {
    const questionId = questionData.questionId || questionData.id;
    const isFavorited = type === 'favorite';
    
    return `
        <button onclick="toggleFavorite('${questionId}')" class="favorite-btn ${isFavorited ? 'favorited' : ''}">
            <span class="favorite-icon">❤️</span> ${isFavorited ? '取消收藏' : '收藏'}
        </button>
    `;
}

/**
 * 渲染题目的数学公式
 */
function renderMathJaxForQuestion(questionItem) {
    const elementsToRender = [
        questionItem.querySelector('.question-content'),
        questionItem.querySelector('.question-analysis'),
        questionItem.querySelector('.question-knowledge'),
        ...questionItem.querySelectorAll('.question-option')
    ];
    
    elementsToRender.forEach(element => {
        if (element) renderMathJax(element);
    });
}

// ===============================
// 操作功能
// ===============================

/**
 * 切换收藏状态
 */
async function toggleFavorite(questionId) {
    try {
        // 检查是否已经收藏
        const favoritesRes = await axios.get(`${baseUrl}/favorite-questions`);
        const isFavorited = favoritesRes.data.some(fav => fav.questionId === questionId);

        if (isFavorited) {
            // 取消收藏
            await axios.delete(`${baseUrl}/favorite-questions/${questionId}`);
            showToast('已取消收藏', 'success');
        } else {
            // 添加收藏
            await axios.post(`${baseUrl}/favorite-questions`, { questionId });
            showToast('题目已收藏', 'success');
        }

        // 刷新当前显示的题库
        if (document.getElementById('gameSection-questionBank').classList.contains('active')) {
            loadQuestionBankData(window.currentQuestionBankTab || 'error');
        }

    } catch (err) {
        console.error('操作收藏失败:', err);
        showToast('操作失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

/**
 * 导出当前题库
 */
async function exportCurrentQuestionBank() {
    try {
        const currentTab = window.currentQuestionBankTab || 'error';
        const url = currentTab === 'error' 
            ? `${baseUrl}/error-bank/export`
            : `${baseUrl}/favorite-questions/export`;
            
        const filename = currentTab === 'error' 
            ? '错题本.md' 
            : '收藏题库.md';

        downloadFile(url, filename);

    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

/**
 * 下载文件
 */
function downloadFile(url, filename) {
    const downloadLink = document.createElement('a');
    downloadLink.href = `${url}?t=${Date.now()}`;
    downloadLink.target = '_blank';
    downloadLink.download = filename;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

/**
 * 打印当前题库（封面页 + 自动编号 + 每2题分页 + DOM等待 + MathJax 渲染）
 */
async function printCurrentQuestionBank() {
    const currentTab = window.currentQuestionBankTab || 'error';

    // ① 获取题库数据
    let bankData = [];
    if (currentTab === 'error') {
        const res = await axios.get(`${baseUrl}/error-bank`);
        bankData = res.data;
    } else {
        const res = await axios.get(`${baseUrl}/favorite-questions`);
        bankData = res.data;
    }

    if (bankData.length === 0) {
        alert("当前题库为空，无法打印");
        return;
    }

    // ② 确保题库详情已加载
    if (allQuestions.length === 0) {
        await initQuestionData();
    }

    // --- 获取统计信息 ---
    const totalCount = bankData.length;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const titleName = currentTab === 'error' ? "错题本" : "收藏题库";

    // ③ 生成打印内容（含题号 + 每2题分页）
    let html = "";
    let index = 1;

    bankData.forEach((item, i) => {
        const full = findQuestionDetail(item.questionId || item.id);
        if (!full) return;

        const questionData = {
            ...full,
            userAnswer: item.userAnswer || "",
            correctAnswer: full.answer,
            questionId: full.id,
            knowledgePoints: full.title || full.knowledgePoints || ""
        };

        const tempDOM = createQuestionItem(
            questionData,
            currentTab === "error" ? "error" : "favorite"
        );

        // 自动分页（每两题分页）
        const pageBreak = ((index % 2) === 0) ? "page-break-after: always;" : "";

        html += `
            <div class="print-question-block" style="${pageBreak}">
                <div class="print-index">第 ${index} 题</div>
                ${tempDOM.outerHTML}
            </div>
        `;

        index++;
    });

    // ④ 打开打印窗口
    const win = window.open("", "_blank");

    win.document.write(`
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${titleName}打印</title>

            <link rel="stylesheet" href="style.css">

            <script>
                window.MathJax = {
                    tex: { inlineMath: [['\\\\(','\\\\)'], ['$', '$']] },
                    svg: { fontCache: 'global' }
                };
            </script>
            <script src="tex-svg.js"></script>

            <style>
                body { padding: 20px; font-size: 16px; }

                .cover-page {
                    text-align: center;
                    margin-top: 180px;
                    page-break-after: always;
                }
                .cover-title {
                    font-size: 38px;
                    font-weight: bold;
                    margin-bottom: 40px;
                }
                .cover-info {
                    font-size: 20px;
                    margin: 10px 0;
                }

                .print-question-block {
                    margin-bottom: 40px;
                    page-break-inside: avoid;
                }

                .print-index {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
            </style>
        </head>
        <body>

            <!-- 封面页 -->
            <div class="cover-page">
                <div class="cover-title">${titleName}打印版</div>

                <div class="cover-info">总题数：${totalCount}</div>
                <div class="cover-info">打印日期：${dateStr}</div>
                <div class="cover-info">打印类型：${titleName}</div>

                <div class="cover-info" style="margin-top: 40px; font-size: 18px; color: #666;">
                    —— Brighty Pk 2025 ©️ ——
                </div>
            </div>

            <div id="printContent">${html}</div>

            <script>
                function wait(ms) {
                    return new Promise(res => setTimeout(res, ms));
                }

                document.addEventListener("DOMContentLoaded", async () => {
                    const el = document.getElementById("printContent");

                    // 等待 DOM 稳定
                    await wait(200);

                    // 渲染数学公式
                    await MathJax.typesetPromise([el]);

                    await wait(200);

                    window.print();
                });
            </script>

        </body>
        </html>
    `);

    win.document.close();
}




/**
 * 清空收藏题库
 */
async function clearFavoriteBank() {
    if (!confirm('确定要清空收藏题库吗？此操作不可恢复！')) return;

    try {
        await axios.delete(`${baseUrl}/favorite-questions`);
        showToast('收藏题库已清空', 'success');
        await loadFavoriteBankData();
        await updateQuestionBankStats('favorite');
    } catch (err) {
        showToast('清空失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

/**
 * 清空错题本
 */
async function clearErrorBank() {
    if (!confirm('确定要清空错题本吗？此操作不可恢复！')) return;

    try {
        await axios.delete(`${baseUrl}/error-bank/clear`);
        showToast('错题本已清空', 'success');
        await loadErrorBankData();
    } catch (err) {
        showToast('清空失败：' + (err.response?.data?.error || '网络错误'), 'error');
    }
}

// ===============================
// 统计信息
// ===============================

/**
 * 更新题库统计信息
 */
async function updateQuestionBankStats(type) {
    try {
        let questions = [];
        
        if (type === 'error') {
            const res = await axios.get(`${baseUrl}/error-bank`);
            questions = res.data;
        } else {
            const res = await axios.get(`${baseUrl}/favorite-questions`);
            questions = res.data;
        }

        const totalQuestions = questions.length;
        const lastUpdate = getLastUpdateTime(questions);

        updateStatsDisplay(totalQuestions, lastUpdate);

    } catch (err) {
        console.error('更新题库统计失败:', err);
    }
}

/**
 * 获取最后更新时间
 */
function getLastUpdateTime(questions) {
    if (questions.length === 0) return '暂无';

    const latest = questions.reduce((latest, q) => {
        const time = new Date(q.timestamp);
        return time > latest ? time : latest;
    }, new Date(0));

    return latest.getTime() > 0 ? latest.toLocaleDateString('zh-CN') : '暂无';
}

/**
 * 更新统计显示
 */
function updateStatsDisplay(totalQuestions, lastUpdate) {
    const totalEl = document.getElementById('totalQuestions');
    const lastUpdateEl = document.getElementById('lastUpdate');
    
    if (totalEl) totalEl.textContent = totalQuestions;
    if (lastUpdateEl) lastUpdateEl.textContent = lastUpdate;
}

// ===============================
// 工具函数
// ===============================

/**
 * 显示加载状态
 */
function showLoadingState(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p style="text-align: center; padding: 40px; color: #718096;">${message}</p>`;
    }
}

/**
 * 显示空状态
 */
function showEmptyState(container, message) {
    container.innerHTML = `<p style="text-align: center; padding: 40px; color: #718096;">${message}</p>`;
}

/**
 * 处理数据加载错误
 */
function handleDataLoadError(containerId, message, error) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p style="text-align: center; padding: 40px; color: #e53e3e;">${message}</p>`;
    }
    showToast(`${message}：${error.response?.data?.error || '网络错误'}`, 'error');
}

/**
 * 首字母大写
 */
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===============================
// 全局函数导出（供其他文件调用）
// ===============================

/**
 * 清空当前题库（供HTML调用）
 */
function clearCurrentQuestionBank() {
    const currentTab = window.currentQuestionBankTab || 'error';
    if (currentTab === 'error') {
        clearErrorBank();
    } else {
        clearFavoriteBank();
    }
}

// 页面加载后初始化题目数据
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        // 延迟初始化，避免影响主页面加载
        setTimeout(() => {
            // 安全地检查 currentUser 是否存在
            if (typeof currentUser !== 'undefined' && currentUser) {
                initQuestionData();
            }
        }, 1000);
    });
}