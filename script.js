document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const playArea = document.getElementById('play-area');
    const clawAssembly = document.getElementById('claw-assembly');
    const claw = document.getElementById('claw');
    const joystickHandle = document.getElementById('joystick-handle');
    const joystickBase = document.querySelector('.joystick-base');
    const bomb = document.getElementById('bomb');
    
    const timerDisplay = document.getElementById('timer');
    const scoreDisplay = document.getElementById('score');
    const livesDisplay = document.getElementById('lives');
    const messageOverlay = document.getElementById('message-overlay');
    const messageText = document.getElementById('message-text');

    // --- 游戏状态变量 ---
    let gameState = 'ready'; // ready, dropping, retracting, caught
    let score = 0;
    let lives = 3;
    let timeLeft = 60;
    let timerInterval;

    let dolls = [];
    let caughtDoll = null;

    // --- 游戏参数配置 ---
    const CLAW_SPEED_DROP = 5;
    const CLAW_SPEED_RETRACT_EMPTY = 6;
    const CLAW_SPEED_RETRACT_BASE = 4; // 抓到东西后的基础回收速度
    const PLAY_AREA_WIDTH = playArea.offsetWidth;
    const PLAY_AREA_HEIGHT = playArea.offsetHeight;
    const CLAW_ASSEMBLY_WIDTH = clawAssembly.offsetWidth;
    const BOMB_MOVE_SPEED = 2; // (CSS动画已处理，这里用于碰撞检测)

    // --- 摇杆控制 ---
    let isDragging = false;
    joystickHandle.addEventListener('mousedown', (e) => {
        if (gameState !== 'ready') return;
        isDragging = true;
        joystickHandle.style.cursor = 'grabbing';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        joystickHandle.style.cursor = 'grab';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const machineRect = joystickBase.getBoundingClientRect();
        // 计算鼠标相对于摇杆底座中心的位置
        let x = e.clientX - (machineRect.left + machineRect.width / 2);
        
        // 限制摇杆范围
        const maxMove = machineRect.width / 2 - joystickHandle.offsetWidth / 2;
        x = Math.max(-maxMove, Math.min(maxMove, x));
        
        joystickHandle.style.left = `calc(50% + ${x}px)`;

        // 将摇杆位置映射到抓钩位置
        // 摇杆在-maxMove到+maxMove之间, 映射到playArea的0到(PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH)
        const clawMinX = 0;
        const clawMaxX = PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH;
        const clawX = ((x + maxMove) / (2 * maxMove)) * (clawMaxX - clawMinX) + clawMinX;
        
        clawAssembly.style.left = `${clawX}px`;
    });

    // --- 游戏核心逻辑 ---
    function initGame() {
        gameState = 'ready';
        score = 0;
        lives = 3;
        timeLeft = 60;
        caughtDoll = null;

        updateUI();
        messageOverlay.classList.add('hidden');
        
        // 清除旧的玩偶和计时器
        playArea.querySelectorAll('.doll').forEach(d => d.remove());
        dolls = [];
        clearInterval(timerInterval);

        // 创建玩偶
        createDolls();
        
        // 重置抓钩位置
        clawAssembly.style.left = `calc(50% - ${CLAW_ASSEMBLY_WIDTH / 2}px)`;
        joystickHandle.style.left = '50%';
        claw.style.bottom = '90%';
        claw.classList.remove('grabbing');
        
        // 启动计时器和游戏循环
        timerInterval = setInterval(() => {
            timeLeft--;
            updateUI();
            if (timeLeft <= 0) {
                gameOver('时间到!');
            }
        }, 1000);

        gameLoop();
    }

    function createDolls() {
        const dollTypes = [
            { class: 'green', weight: 1.2, value: 100 },
            { class: 'purple', weight: 2.0, value: 250 },
            { class: 'green', weight: 1.0, value: 80 },
            { class: 'purple', weight: 1.8, value: 200 },
            { class: 'green', weight: 1.5, value: 150 },
        ];

        dollTypes.forEach((type, index) => {
            const dollEl = document.createElement('div');
            dollEl.classList.add('doll', type.class);
            const xPos = 20 + index * (PLAY_AREA_WIDTH / dollTypes.length);
            dollEl.style.left = `${xPos}px`;
            
            playArea.appendChild(dollEl);
            
            dolls.push({
                element: dollEl,
                weight: type.weight,
                value: type.value,
                isCaught: false
            });
        });
    }

    function updateUI() {
        timerDisplay.textContent = `时间: ${timeLeft}`;
        scoreDisplay.textContent = `金钱: $${score}`;
        livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives);
    }
    
    // --- 按键控制 ---
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && gameState === 'ready') {
            dropClaw();
        }
        if (e.code === 'Escape') {
            initGame();
        }
    });

    function dropClaw() {
        gameState = 'dropping';
    }

    // --- 游戏循环 (关键) ---
    function gameLoop() {
        if (gameState === 'dropping') {
            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom - CLAW_SPEED_DROP / 10}%`;

            // 碰撞检测
            checkCollisions();

            // 如果到底了
            if (parseFloat(claw.style.bottom) <= 5) {
                claw.style.bottom = '5%';
                gameState = 'retracting';
            }
        }

        if (gameState === 'retracting' || gameState === 'caught') {
            let retractSpeed = CLAW_SPEED_RETRACT_EMPTY;
            if (gameState === 'caught' && caughtDoll) {
                // 重量影响速度
                retractSpeed = CLAW_SPEED_RETRACT_BASE / caughtDoll.weight;
            }

            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom + retractSpeed / 10}%`;
            
            // 如果抓着娃娃，让娃娃跟着爪子移动
            if (caughtDoll) {
                const clawRect = claw.getBoundingClientRect();
                const playAreaRect = playArea.getBoundingClientRect();
                caughtDoll.element.style.top = `${clawRect.bottom - playAreaRect.top - 20}px`;
            }

            // 碰撞检测
            checkCollisions();

            // 如果回到顶部
            if (parseFloat(claw.style.bottom) >= 90) {
                claw.style.bottom = '90%';
                if (gameState === 'caught' && caughtDoll) {
                    // 成功抓取
                    score += caughtDoll.value;
                    caughtDoll.element.remove(); // 移除娃娃
                    dolls = dolls.filter(d => d !== caughtDoll);
                    caughtDoll = null;
                }
                gameState = 'ready';
                claw.classList.remove('grabbing');
                updateUI();
            }
        }
        
        // 只要游戏没结束就一直循环
        if (gameState !== 'over') {
            requestAnimationFrame(gameLoop);
        }
    }

    function checkCollisions() {
        const clawRect = claw.getBoundingClientRect();

        // 1. 与炸弹的碰撞
        const bombRect = bomb.getBoundingClientRect();
        if (isColliding(clawRect, bombRect)) {
            loseLife();
            return; // 发生碰撞后立即返回，避免重复处理
        }

        // 2. 与玩偶的碰撞 (只在下降时检测)
        if (gameState === 'dropping') {
            for (const doll of dolls) {
                if (doll.isCaught) continue;
                const dollRect = doll.element.getBoundingClientRect();
                if (isColliding(clawRect, dollRect)) {
                    grabDoll(doll);
                    return;
                }
            }
        }
    }
    
    function isColliding(rect1, rect2) {
        return !(
            rect1.right < rect2.left ||
            rect1.left > rect2.right ||
            rect1.bottom < rect2.top ||
            rect1.top > rect2.bottom
        );
    }
    
    function grabDoll(doll) {
        gameState = 'caught';
        caughtDoll = doll;
        doll.isCaught = true;
        claw.classList.add('grabbing');
        
        // 让娃娃吸附到抓钩上
        const clawRect = claw.getBoundingClientRect();
        const playAreaRect = playArea.getBoundingClientRect();
        doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth)/2}px`;
    }

    function loseLife() {
        lives--;
        updateUI();
        
        // 视觉反馈：屏幕闪烁
        playArea.style.animation = 'flash 0.3s';
        setTimeout(() => playArea.style.animation = '', 300);

        if (caughtDoll) {
            // 销毁抓到的玩偶
            caughtDoll.element.remove();
            dolls = dolls.filter(d => d !== caughtDoll);
            caughtDoll = null;
        }
        
        // 重置抓钩状态
        gameState = 'retracting'; // 强制收回
        claw.classList.remove('grabbing');
        
        if (lives <= 0) {
            gameOver('生命耗尽!');
        }
    }

    function gameOver(message) {
        gameState = 'over';
        clearInterval(timerInterval);
        messageText.textContent = message;
        messageOverlay.classList.remove('hidden');
    }

    // --- 初始化游戏 ---
    initGame();
});

// 添加闪烁动画的CSS
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes flash {
    0%, 100% { background-color: rgba(199, 0, 57, 0.3); }
    50% { background-color: rgba(199, 0, 57, 0.7); }
}`;
document.head.appendChild(styleSheet);