      // 用户注册
      async function registerUser() {
          const username = document.getElementById('regUsername').value.trim();
          const password = document.getElementById('regPassword').value.trim();
          const email = document.getElementById('regEmail').value.trim();
          const regMsg = document.getElementById('regMsg');
          const regBtn = document.getElementById('regBtn');

          // 表单验证
          if (!username || username.length < 3 || username.length > 16) {
              regMsg.textContent = '用户名需为3-16位字符';
              regMsg.className = 'msg error';
              return;
          }
          if (!password || password.length < 6 || password.length > 20) {
              regMsg.textContent = '密码需为6-20位字符';
              regMsg.className = 'msg error';
              return;
          }
          if (!email || !/^[\w.-]+@[a-zA-Z0-9-]+\.[a-zA-Z]+$/.test(email)) {
              regMsg.textContent = '请输入有效的邮箱地址';
              regMsg.className = 'msg error';
              return;
          }

          // 禁用按钮防止重复提交
          regBtn.disabled = true;
          regMsg.textContent = '正在注册...';
          regMsg.className = 'msg info';

          try {
              const res = await axios.post(`${baseUrl}/register`, {
                  username,
                  password,
                  email
              });
              regMsg.textContent = `注册成功！你的用户ID：${res.data.id}，1.5秒后跳转登录`;
              regMsg.className = 'msg success';
              setTimeout(() => showModule('loginModule'), 1500);
          } catch (err) {
              regMsg.textContent = err.response?.data?.error || '注册失败，请重试';
              regMsg.className = 'msg error';
          } finally {
              regBtn.disabled = false;
          }
      }

      // 用户登录
      async function loginUser() {
          const username = document.getElementById('loginUsername').value.trim();
          const password = document.getElementById('loginPassword').value.trim();
          const loginMsg = document.getElementById('loginMsg');
          const loginBtn = document.getElementById('loginBtn');

          if (!username || !password) {
              loginMsg.textContent = '请填写用户名和密码';
              loginMsg.className = 'msg error';
              return;
          }

          loginBtn.disabled = true;
          loginMsg.textContent = '正在登录...';
          loginMsg.className = 'msg info';

          try {
              const res = await axios.post(`${baseUrl}/login`, {
                  username,
                  password
              });
              currentUser = res.data;
              localStorage.setItem('currentUser', JSON.stringify(currentUser));
              loginMsg.textContent = '登录成功！即将进入游戏';
              loginMsg.className = 'msg success';
              await updateUserInfo();
              setTimeout(() => {
                  showModule('gameModule');
                  initWebSocket();
              }, 500);
          } catch (err) {
              loginMsg.textContent = err.response?.data?.error || '登录失败，请检查账号密码';
              loginMsg.className = 'msg error';
          } finally {
              loginBtn.disabled = false;
          }
      }

      // 退出登录
      // 退出登录 - 统一处理显示状态
      function logout() {
          if (ws) {
              ws.close(1000, '用户主动退出');
              ws = null;
          }
          localStorage.removeItem('currentUser');
          currentUser = null;
          resetBattleState();

          // 重置游戏模块的显示状态 - 关键修复！
          document.querySelectorAll('.game-section').forEach(section => {
              section.style.display = 'none';
              section.classList.remove('active');
          });

          // 显示对战模块作为默认页面
          document.getElementById('gameSection-match').style.display = 'block';
          document.getElementById('gameSection-match').classList.add('active');

          // 重置导航按钮状态
          document.querySelectorAll('.nav-btn').forEach(btn => {
              btn.classList.remove('active');
          });
          document.getElementById('navMatch').classList.add('active');

          // 切换模块显示
          document.getElementById('gameModule').style.display = 'none';
          document.getElementById('registerModule').style.display = 'none';
          document.getElementById('loginModule').style.display = 'block';
          document.getElementById('bottomNav').style.display = 'none';

          // 清空登录表单
          document.getElementById('loginUsername').value = '';
          document.getElementById('loginPassword').value = '';

          // 重置所有提示信息
          document.querySelectorAll('.msg').forEach(msg => {
              msg.textContent = '';
              msg.className = 'msg';
          });

          console.log('用户已退出登录');
      }