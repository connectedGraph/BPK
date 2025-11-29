//mathjax配置
 window.MathJax = {
     tex: {
         inlineMath: [
             ['$', '$'],
             ['\\(', '\\)']
         ],
         displayMath: [
             ['$$', '$$'],
             ['\\[', '\\]']
         ],
         processEscapes: true
     },
     svg: {
         fontCache: 'global'
     },
     startup: {
         typeset: false
     }
 };

 // 页面加载计时器
 function startPageLoadTimer() {
     // 初始化计时变量
     let elapsedSeconds = 0;
     const timerDisplayElement = document.getElementById('timer');
     const pageLoadTimerInterval = setInterval(function() {
         elapsedSeconds++;
         if (timerDisplayElement) {
             timerDisplayElement.textContent = elapsedSeconds;
         }
     }, 1000);

     // 返回停止函数，方便在页面加载完成后调用
     return {
         stopTimer: function() {
             clearInterval(pageLoadTimerInterval);
             return elapsedSeconds;
         },
         getCurrentTime: function() {
             return elapsedSeconds;
         }
     };
 }
 const pageTimer = startPageLoadTimer();
 
 // 分类消息提示 success error
 function showToast(message, type = 'success') {
     // 1. 先移除已存在的Toast（防重复）
     const oldToast = document.getElementById('global-toast');
     if (oldToast) {
         document.body.removeChild(oldToast);
     }

     // 2. 创建Toast元素（强制挂载到body，脱离所有业务容器）
     const toast = document.createElement('div');
     toast.id = 'global-toast'; // 唯一标识，方便移除

     // 核心：用行内样式兜底（彻底摆脱Tailwind/父容器样式干扰）
     Object.assign(toast.style, {
         position: 'fixed', // 基于视口定位
         top: '16px', // 顶部16px（对应top-4）
         right: '16px', // 右侧16px（对应right-4）
         padding: '12px 24px', // 内边距（px-6 py-3）
         borderRadius: '8px', // 圆角
         boxShadow: '0 4px 12px rgba(0,0,0,0.15)', // 阴影
         zIndex: '9999', // 最高层级，避免被遮挡
         transition: 'all 0.3s ease', // 过渡动画
         transform: 'translateX(100px)', // 初始右移（隐藏）
         opacity: '0', // 初始透明
         color: '#fff', // 文字白色
         backgroundColor: type === 'success' ? '#22c55e' : '#ef4444', // 背景色
         pointerEvents: 'none' // 不遮挡点击（可选）
     });

     // 3. 设置提示文本
     toast.textContent = message;

     // 4. 强制插入到<body>最外层（关键！脱离所有业务容器）
     document.body.appendChild(toast);

     // 5. 触发滑入动画（延迟10ms确保DOM已插入）
     setTimeout(() => {
         toast.style.transform = 'translateX(0)';
         toast.style.opacity = '1';
     }, 10);

     // 6. 3秒后滑出并移除
     setTimeout(() => {
         toast.style.transform = 'translateX(100px)';
         toast.style.opacity = '0';

         // 动画结束后移除DOM
         setTimeout(() => {
             if (document.body.contains(toast)) {
                 document.body.removeChild(toast);
             }
         }, 300);
     }, 3000);
 }
 
 // MathJax渲染函数
 function renderMathJax(element) {
     if (window.MathJax && element) {
         try {
             MathJax.typesetPromise([element]).catch(err => {
                 console.warn('MathJax渲染警告:', err);
             });
         } catch (error) {
             console.error('MathJax渲染错误:', error);
         }
     }
 }
 
 // 延迟渲染函数，用于动态内容
 function renderMathJaxDelayed(element, delay = 100) {
     setTimeout(() => {
         renderMathJax(element);
     }, delay);
 }

 // 更新用户信息（在auth.js中调用）
 async function updateUserInfo() {
     if (!currentUser) return;
     try {
         const res = await axios.get(`${baseUrl}/user`);
         const userData = res.data;
         // 更新当前用户数据
         Object.assign(currentUser, userData);
         localStorage.setItem('currentUser', JSON.stringify(currentUser));
         
         // 更新用户信息显示
         const userInfoEl = document.getElementById('userInfo');
         if (userInfoEl) {
             userInfoEl.innerHTML = `
                 <div style="background: #f0f8ff; padding: 10px; border-radius: 6px; margin: 10px 0;">
                     <p>欢迎，<strong>${currentUser.username}</strong>！</p>
                     <p>积分：<span style="color: #4299e1; font-weight: bold;">${currentUser.score}</span> | 
                        胜场：<span style="color: #48bb78;">${currentUser.wins}</span> | 
                        负场：<span style="color: #e53e3e;">${currentUser.losses}</span></p>
                     <p>信誉分：<span style="color: #ed8936; font-weight: bold;">${currentUser.credit || 100}</span></p>
                 </div>
             `;
         }
     } catch (err) {
         console.error('更新用户信息失败:', err);
     }
 }

 // 安全退出相关辅助函数

 /**
  * 显示对战保存通知
  */
 function showBattleSavedNotification(data) {
     const notification = document.createElement('div');
     notification.className = 'msg info';
     notification.style.margin = '10px 0';
     notification.style.padding = '10px';
     notification.style.borderRadius = '6px';
     notification.style.backgroundColor = '#f0f8ff';
     notification.style.border = '1px solid #4299e1';
     
     notification.innerHTML = `
         <strong>对局已保存</strong>
         <p style="margin: 5px 0;">${data.message || '你的答题数据已安全保存'}</p>
         <button onclick="viewBattleInProfile('${data.battleId}')" 
                 style="background: #4299e1; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
             查看对局记录
         </button>
     `;

     // 插入到页面顶部
     const gameModule = document.getElementById('gameModule');
     if (gameModule) {
         gameModule.insertBefore(notification, gameModule.firstChild);
     }
 }

 /**
  * 查看对局记录
  */
 function viewBattleInProfile(battleId) {
     showGameSection('profile');
     showToast('已跳转到个人资料页面，请查看对战记录', 'success');
     
     // 可选：在这里可以添加高亮特定对局的逻辑
     // 例如，在个人资料页面中滚动到对应的对战记录
     setTimeout(() => {
         const battleHistoryList = document.getElementById('battleHistoryList');
         if (battleHistoryList) {
             const targetBattle = battleHistoryList.querySelector(`[data-battle-id="${battleId}"]`);
             if (targetBattle) {
                 targetBattle.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 targetBattle.style.backgroundColor = '#f0f8ff';
                 targetBattle.style.transition = 'background-color 0.3s';
                 setTimeout(() => {
                     targetBattle.style.backgroundColor = '';
                 }, 3000);
             }
         }
     }, 500);
 }

 /**
  * 显示安全退出按钮
  */
 function showSafeExitButton() {
     const btn = document.getElementById('safeExitBtn');
     if (btn) {
         btn.style.display = 'inline-block';
         // 确保按钮点击事件绑定
         btn.onclick = function() {
             safeExit();
         };
     }
 }

 /**
  * 隐藏安全退出按钮
  */
 function hideSafeExitButton() {
     const btn = document.getElementById('safeExitBtn');
     if (btn) {
         btn.style.display = 'none';
     }
 }

 /**
  * 安全退出函数
  */
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
 if (typeof document !== 'undefined') {
     document.addEventListener('DOMContentLoaded', function() {
         setTimeout(() => {
             hideSafeExitButton();
         }, 100);
     });
 }