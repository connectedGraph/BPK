const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

// 数据文件路径（与server.js保持一致）
const DATA_DIR = path.join(__dirname, 'data');
const USER_DATA_PATH = path.join(DATA_DIR, 'users.json');
const FRIENDSHIPS_PATH = path.join(DATA_DIR, 'friendships.json');

// 初始化数据存储（模拟server.js中的结构）
let users = new Map();
let friends = new Map();

/**
 * 从文件加载用户数据
 */
async function loadUsers() {
    try {
        const userData = await fs.readFile(USER_DATA_PATH, 'utf8');
        const parsed = JSON.parse(userData);
        parsed.forEach(user => users.set(user.id, user));
        console.log(`✅ 已加载 ${users.size} 个用户`);
    } catch (error) {
        console.log('❌ 加载用户数据失败，将创建新文件');
        await fs.writeFile(USER_DATA_PATH, '[]');
    }
}

/**
 * 从文件加载好友数据
 */
async function loadFriends() {
    try {
        const friendsData = await fs.readFile(FRIENDSHIPS_PATH, 'utf8');
        const parsed = JSON.parse(friendsData);
        parsed.forEach(({ userId, friendIds }) => {
            friends.set(userId, friendIds);
        });
        console.log(`✅ 已加载好友关系数据`);
    } catch (error) {
        console.log('❌ 加载好友数据失败，将创建新文件');
        await fs.writeFile(FRIENDSHIPS_PATH, '[]');
    }
}

/**
 * 持久化用户数据
 */
async function persistUsers() {
    const userArray = Array.from(users.values());
    await fs.writeFile(USER_DATA_PATH, JSON.stringify(userArray, null, 2));
    console.log(`💾 已保存用户数据: ${userArray.length} 个用户`);
}

/**
 * 持久化好友数据
 */
async function persistFriendData() {
    const friendshipsArray = Array.from(friends.entries()).map(([userId, friendIds]) => ({
        userId,
        friendIds
    }));
    await fs.writeFile(FRIENDSHIPS_PATH, JSON.stringify(friendshipsArray, null, 2));
    console.log(`💾 已保存好友关系数据`);
}

/**
 * 批量创建G103系列账号
 */
async function batchRegisterG103Users() {
    try {
        console.log('🚀 开始批量创建G103系列账号...');
        
        // 先加载现有数据
        await loadUsers();
        await loadFriends();

        const targetUserId = "user-f9742d9e-34f1-4d63-8298-6c10a3c7b84e";
        const startNum = 1;
        const endNum = 51;
        const baseUsername = "G103";
        
        // 检查目标用户是否存在
        const targetUser = users.get(targetUserId);
        if (!targetUser) {
            console.log('⚠️  目标用户不存在，将只创建G103账号');
        } else {
            console.log(`🎯 目标用户: ${targetUser.username} (${targetUserId})`);
        }

        const createdUsers = [];
        const failedUsers = [];

        for (let i = startNum; i <= endNum; i++) {
            const username = `${baseUsername}${i.toString().padStart(2, '0')}`;
            
            // 检查用户名是否已存在
            if (Array.from(users.values()).some(u => u.username === username)) {
                console.log(`⏭️  用户名 ${username} 已存在，跳过`);
                failedUsers.push({ username, reason: '用户名已存在' });
                continue;
            }

            // 创建用户对象
            const user = {
                id: `user-${uuidv4()}`,
                username,
                password: "123456",
                email: `${username}@example.com`,
                score: 1000,
                credit: 100,
                dailyRecovered: 0,
                creditUpdateTime: new Date().toISOString(),
                wins: 0,
                losses: 0,
                escapes: 0,
                negativeGames: 0,
                currentStreak: 0,
                maxStreak: 0,
                battleHistory: [],
                createdAt: new Date().toISOString()
            };

            // 保存用户
            users.set(user.id, user);
            createdUsers.push({
                id: user.id,
                username: user.username,
                password: user.password,
                email: user.email
            });

            console.log(`✅ 创建用户: ${username}`);

            // 如果目标用户存在，建立好友关系
            if (targetUser) {
                try {
                    const targetUserFriends = friends.get(targetUserId) || [];
                    const newUserFriends = friends.get(user.id) || [];

                    if (!targetUserFriends.includes(user.id)) {
                        targetUserFriends.push(user.id);
                        friends.set(targetUserId, targetUserFriends);
                    }

                    if (!newUserFriends.includes(targetUserId)) {
                        newUserFriends.push(targetUserId);
                        friends.set(user.id, newUserFriends);
                    }

                    console.log(`   🤝 已绑定好友: ${targetUser.username} <-> ${username}`);
                } catch (friendError) {
                    console.error(`❌ 绑定好友失败 ${username}:`, friendError);
                    failedUsers.push({ username, reason: '好友关系建立失败' });
                }
            }
        }

        // 保存数据
        await persistUsers();
        await persistFriendData();

        console.log('\n🎉 批量创建完成!');
        console.log('📊 统计:');
        console.log(`   总计: ${endNum - startNum + 1}`);
        console.log(`   成功: ${createdUsers.length}`);
        console.log(`   失败: ${failedUsers.length}`);
        
        if (targetUser) {
            console.log(`   目标用户好友数: ${(friends.get(targetUserId) || []).length}`);
        }

        if (failedUsers.length > 0) {
            console.log('\n❌ 失败的用户:');
            failedUsers.forEach(failed => {
                console.log(`   ${failed.username}: ${failed.reason}`);
            });
        }

        // 显示创建的用户列表
        console.log('\n👥 创建的用户列表:');
        createdUsers.forEach(user => {
            console.log(`   ${user.username} - 密码: ${user.password} - ID: ${user.id}`);
        });

    } catch (error) {
        console.error('💥 批量创建失败:', error);
    }
}

// 运行脚本
batchRegisterG103Users();