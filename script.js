document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const playArea = document.getElementById('play-area');
    const clawAssembly = document.getElementById('claw-assembly');
    const claw = document.getElementById('claw');
    const joystickHandle = document.getElementById('joystick-handle');
    const joystickBase = document.querySelector('.joystick-base');
    const bombContainer = document.getElementById('bomb-container');

    const timerDisplay = document.getElementById('timer');
    const scoreDisplay = document.getElementById('score');
    const livesDisplay = document.getElementById('lives');
    const messageOverlay = document.getElementById('message-overlay');
    const messageText = document.getElementById('message-text');
    const dropButton = document.getElementById('drop-button');

    // --- 游戏状态变量 ---
    let gameState = 'ready'; // ready, dropping, retracting, caught
    let score = 0;
    let lives = 3;
    let timeLeft = 60;
    let timerInterval;

    let dolls = [];
    let bombs = [];
    let caughtDoll = null;
    let isInvincible = false;
    let isBoosting = false; // 跟踪是否正在加速
    let lastFrameTime = performance.now(); // 用于计算帧时间差

    // --- 游戏参数配置 ---
    const CLAW_SPEED_DROP = 5;
    const CLAW_SPEED_RETRACT_EMPTY = 6;
    const CLAW_SPEED_RETRACT_BASE = 4; // 抓到东西后的基础回收速度
    const PLAY_AREA_WIDTH = playArea.offsetWidth;
    const PLAY_AREA_HEIGHT = playArea.offsetHeight;
    const CLAW_ASSEMBLY_WIDTH = clawAssembly.offsetWidth;
    const BOMB_MOVE_SPEED = 2; // (CSS动画已处理，这里用于碰撞检测)
    const BOOST_COST_PER_SECOND = 50; // 加速每秒消耗50金钱
    const BOOST_SPEED_MULTIPLIER = 2.0; // 加速时速度变为原来的2倍

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

        // 清除旧的炸弹和动画规则
        bombContainer.innerHTML = '';
        bombs = [];
        // 注意：动态添加的@keyframes规则理论上也应清除，但对于这个游戏体量，不清除也无大碍。
        // 如果追求完美，需要更复杂的样式表管理，暂时简化。

        // 创建玩偶
        createDolls();

        // 创建初始炸弹
        createBomb();
        
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
            // 增加了 size 属性 (基础大小为1.0)
            { class: 'green', weight: 1.0, value: 80,  size: 0.9 },
            { class: 'purple', weight: 1.8, value: 200, size: 1.2 },
            { class: 'green', weight: 1.2, value: 100, size: 1.0 },
            { class: 'purple', weight: 2.0, value: 250, size: 1.3 },
            { class: 'green', weight: 1.5, value: 150, size: 1.1 },
        ];

        dollTypes.forEach((type, index) => {
            const dollEl = document.createElement('div');
            dollEl.classList.add('doll', type.class);

            // 根据 size 属性动态设置玩偶大小
            const baseWidth = 50; // px
            const baseHeight = 70; // px
            dollEl.style.width = `${baseWidth * type.size}px`;
            dollEl.style.height = `${baseHeight * type.size}px`;

            // 为了避免大玩偶重叠，稍微调整间距
            const xPos = 20 + index * (PLAY_AREA_WIDTH / (dollTypes.length - 0.5));
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

    function createBomb() {
    const bombEl = document.createElement('div');
    bombEl.classList.add('bomb');

    // 随机设置炸弹的垂直位置
    const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300); // 在一定范围内随机
    bombEl.style.top = `${randomTop}px`;

    // 随机决定炸弹的移动方向和速度
    const animationDuration = 6 + Math.random() * 4; // 6-10秒
    const animationName = `moveBomb_${Date.now()}`; // 创建一个唯一的动画名
    const direction = Math.random() < 0.5 ? 'left-to-right' : 'right-to-left';

    let keyframes;
    if (direction === 'left-to-right') {
        bombEl.style.left = `10px`;
        keyframes = `
            @keyframes ${animationName} {
                from { left: 10px; }
                to { left: calc(100% - 50px); }
            }`;
    } else {
        bombEl.style.left = `calc(100% - 50px)`;
        keyframes = `
            @keyframes ${animationName} {
                from { left: calc(100% - 50px); }
                to { left: 10px; }
            }`;
    }

    // 动态创建并插入 keyframes 动画
    const styleSheet = document.styleSheets[document.styleSheets.length - 1];
    styleSheet.insertRule(keyframes, styleSheet.cssRules.length);
    
    // 应用动画
    bombEl.style.animation = `${animationName} ${animationDuration}s linear infinite alternate`;
    
    bombContainer.appendChild(bombEl);
    
    bombs.push({
        element: bombEl
    });
}

    function updateUI() {
        timerDisplay.textContent = `时间: ${timeLeft}`;
        scoreDisplay.textContent = `金钱: $${score}`;
        livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives);
    }
    
    // --- 交互控制 ---
    // 1. 按钮交互
    dropButton.addEventListener('mousedown', () => {
        if (gameState === 'ready') {
            dropClaw();
        } else if (gameState === 'retracting' || gameState === 'caught') {
            isBoosting = true;
        }
    });

    document.addEventListener('mouseup', () => {
        // 抬起鼠标时，无论在何处，都应停止加速
        isBoosting = false;
    });
    // 鼠标移出按钮也应停止加速
    dropButton.addEventListener('mouseleave', () => {
        isBoosting = false;
    });


    // 2. 键盘快捷键 (ESC重置)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            initGame();
        }
    });

    function dropClaw() {
        gameState = 'dropping';
    }

    // --- 游戏循环 (关键) ---
    function gameLoop(currentTime) {
        // 计算自上一帧以来经过的时间（以秒为单位）
        const deltaTime = (currentTime - lastFrameTime) / 1000;
        lastFrameTime = currentTime;

        if (gameState === 'dropping') {
            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom - CLAW_SPEED_DROP / 10}%`;

            checkCollisions();

            if (parseFloat(claw.style.bottom) <= 5) {
                claw.style.bottom = '5%';
                gameState = 'retracting';
            }
        }

        if (gameState === 'retracting' || gameState === 'caught') {
            let retractSpeed = CLAW_SPEED_RETRACT_EMPTY;
            if (gameState === 'caught' && caughtDoll) {
                retractSpeed = CLAW_SPEED_RETRACT_BASE / caughtDoll.weight;
            }

            // --- 加速逻辑 ---
            if (isBoosting && score > 0) {
                retractSpeed *= BOOST_SPEED_MULTIPLIER;
                
                // 根据时间差来扣钱，更精确
                const cost = BOOST_COST_PER_SECOND * deltaTime;
                score = Math.max(0, score - cost);
                
                // 实时更新UI，但可以稍微节流以避免性能问题
                // 这里为了简单，直接更新
                scoreDisplay.textContent = `金钱: $${Math.floor(score)}`;
            }
            // --- 加速逻辑结束 ---

            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom + retractSpeed / 10}%`;
            
            if (caughtDoll) {
                const clawRect = claw.getBoundingClientRect();
                const playAreaRect = playArea.getBoundingClientRect();
                caughtDoll.element.style.top = `${clawRect.bottom - playAreaRect.top - 20}px`;
            }

            checkCollisions();

            if (parseFloat(claw.style.bottom) >= 90) {
                claw.style.bottom = '90%';
                if (gameState === 'caught' && caughtDoll) {
                    score += caughtDoll.value;
                    caughtDoll.element.remove();
                    dolls = dolls.filter(d => d !== caughtDoll);
                    caughtDoll = null;
                    createBomb();
                }
                gameState = 'ready';
                claw.classList.remove('grabbing');
                isBoosting = false; // 重置加速状态
                updateUI(); // 最终更新一次UI
            }
        }
        
        if (gameState !== 'over') {
            requestAnimationFrame(gameLoop);
        }
    }

    function checkCollisions() {
        const clawRect = claw.getBoundingClientRect();

        // 1. 与所有炸弹的碰撞
        for (const bomb of bombs) {
            const bombRect = bomb.element.getBoundingClientRect();
            if (isColliding(clawRect, bombRect)) {
                loseLife();
                return; // 发生碰撞后立即返回
            }
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
        // 如果正处于无敌状态，则不执行任何操作
        if (isInvincible) {
            return;
        }

        // 进入无敌状态
        isInvincible = true;

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

        // 设置一个0.5秒的无敌时间，之后恢复正常
        setTimeout(() => {
            isInvincible = false;
        }, 500); // 500毫秒的无敌时间
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