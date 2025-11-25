// --- DOM 元素获取 ---
const gameContainer = document.getElementById('game-container');
const playArea = document.getElementById('play-area');
const clawAssembly = document.getElementById('claw-assembly');
const claw = document.getElementById('claw');
const bombContainer = document.getElementById('bomb-container');
const heatBar = document.getElementById('heat-bar');

const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');

// --- 游戏状态变量 ---
let gameState = 'ready'; // ready, aiming, dropping, retracting, caught, stunned, over
let score = 0;
let lives = 3;
let timeLeft = 60;
let timerInterval;
let heat = 0; // 热度值 0-100

let dolls = [];
let bombs = [];
let caughtDoll = null;
let isInvincible = false;

// --- M1 新增的状态变量 ---
let isAiming = false;
let isBoosting = false;

// --- 游戏参数配置 ---
const CLAW_SPEED_DROP = 7; // 提高下落速度，更爽快
const CLAW_SPEED_RETRACT_EMPTY = 6;
const CLAW_SPEED_RETRACT_BASE = 4;
const BOOST_MULTIPLIER = 3.0; // 加速倍率
const HEAT_INCREASE_RATE = 80; // 每秒增加的热度
const HEAT_DECREASE_RATE = 30; // 每秒减少的热度

const PLAY_AREA_WIDTH = playArea.offsetWidth;
const PLAY_AREA_HEIGHT = playArea.offsetHeight;
const CLAW_ASSEMBLY_WIDTH = clawAssembly.offsetWidth;

// --- M1 核心：全新输入逻辑 ---
gameContainer.addEventListener('mousedown', handlePointerDown);
gameContainer.addEventListener('touchstart', handlePointerDown);

gameContainer.addEventListener('mousemove', handlePointerMove);
gameContainer.addEventListener('touchmove', handlePointerMove);

document.addEventListener('mouseup', handlePointerUp);
document.addEventListener('touchend', handlePointerUp);

function handlePointerDown(e) {
    if (gameState === 'ready') {
        isAiming = true;
        gameState = 'aiming';
    } else if (gameState === 'retracting' || gameState === 'caught') {
        isBoosting = true;
    }
    e.preventDefault();
}

function handlePointerMove(e) {
    if (!isAiming) return;
    
    // 统一处理触摸和鼠标事件
    const pointerX = e.touches ? e.touches[0].clientX : e.clientX;
    const playAreaRect = playArea.getBoundingClientRect();

    const clawMinX = 0;
    const clawMaxX = PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH;
    
    // 将屏幕坐标转换为 playArea 内的相对坐标
    let targetX = pointerX - playAreaRect.left - (CLAW_ASSEMBLY_WIDTH / 2);
    targetX = Math.max(clawMinX, Math.min(clawMaxX, targetX));
    
    clawAssembly.style.left = `${targetX}px`;
    e.preventDefault();
}

function handlePointerUp(e) {
    if (isAiming) {
        isAiming = false;
        dropClaw();
    }
    if (isBoosting) {
        isBoosting = false;
    }
    e.preventDefault();
}

// --- 游戏核心逻辑 ---
function initGame() {
    gameState = 'ready';
    score = 0;
    lives = 3;
    timeLeft = 60;
    heat = 0;
    updateHeatBar();

    caughtDoll = null;
    isInvincible = false;
    isAiming = false;
    isBoosting = false;

    updateUI();
    messageOverlay.classList.add('hidden');
    
    playArea.querySelectorAll('.doll').forEach(d => d.remove());
    dolls = [];
    bombContainer.innerHTML = '';
    bombs = [];
    clearInterval(timerInterval);

    createDolls();
    createBomb();
    
    clawAssembly.style.left = `calc(50% - ${CLAW_ASSEMBLY_WIDTH / 2}px)`;
    claw.style.bottom = '90%';
    claw.classList.remove('grabbing');
    
    timerInterval = setInterval(() => {
        if (gameState !== 'over') {
            timeLeft--;
            updateUI();
            if (timeLeft <= 0) {
                gameOver('时间到!');
            }
        }
    }, 1000);

    // 启动游戏循环
    let lastTime = 0;
    function gameLoop(currentTime) {
        if (lastTime === 0) {
            lastTime = currentTime;
            requestAnimationFrame(gameLoop);
            return;
        }
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        updateGame(deltaTime); // 将游戏逻辑放入一个独立的函数
        
        if (gameState !== 'over') {
            requestAnimationFrame(gameLoop);
        }
    }
    requestAnimationFrame(gameLoop);
}

function updateHeatBar() {
    heatBar.style.height = `${heat}%`;
}

function createDolls() { /* ...此函数不变，可以复制你之前的版本... */ 
    const dollTypes = [{ class: 'green', weight: 1.0, value: 80,  size: 0.9 },{ class: 'purple', weight: 1.8, value: 200, size: 1.2 },{ class: 'green', weight: 1.2, value: 100, size: 1.0 },{ class: 'purple', weight: 2.0, value: 250, size: 1.3 },{ class: 'green', weight: 1.5, value: 150, size: 1.1 },];
    dollTypes.forEach((type, index) => {
        const dollEl = document.createElement('div');
        dollEl.classList.add('doll', type.class);
        const baseWidth = 50, baseHeight = 70;
        dollEl.style.width = `${baseWidth * type.size}px`;
        dollEl.style.height = `${baseHeight * type.size}px`;
        const xPos = 20 + index * (PLAY_AREA_WIDTH / (dollTypes.length - 0.5));
        dollEl.style.left = `${xPos}px`;
        playArea.appendChild(dollEl);
        dolls.push({ element: dollEl, weight: type.weight, value: type.value, isCaught: false });
    });
}
function createBomb() { /* ...此函数不变... */
    const bombEl = document.createElement('div');
    bombEl.classList.add('bomb');
    const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300);
    bombEl.style.top = `${randomTop}px`;
    const animationDuration = 6 + Math.random() * 4;
    const animationName = `moveBomb_${Date.now()}`;
    const direction = Math.random() < 0.5 ? 'left-to-right' : 'right-to-left';
    let keyframes;
    if (direction === 'left-to-right') {
        bombEl.style.left = `10px`;
        keyframes = `@keyframes ${animationName} { from { left: 10px; } to { left: calc(100% - 50px); } }`;
    } else {
        bombEl.style.left = `calc(100% - 50px)`;
        keyframes = `@keyframes ${animationName} { from { left: calc(100% - 50px); } to { left: 10px; } }`;
    }
    const styleSheet = document.styleSheets[document.styleSheets.length - 1];
    styleSheet.insertRule(keyframes, styleSheet.cssRules.length);
    bombEl.style.animation = `${animationName} ${animationDuration}s linear infinite alternate`;
    bombContainer.appendChild(bombEl);
    bombs.push({ element: bombEl, isDestroyed: false }); // 增加一个状态
}
function updateUI() { /* ...此函数不变... */
    timerDisplay.textContent = `时间: ${timeLeft}`;
    scoreDisplay.textContent = `金钱: $${Math.floor(score)}`;
    livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives);
}
document.addEventListener('keydown', (e) => { if (e.code === 'Escape') initGame(); });
function dropClaw() { gameState = 'dropping'; }

// M1 核心：重构游戏主循环
function updateGame(deltaTime) {
    // 热度条更新逻辑
    if (isBoosting && gameState !== 'stunned') { // 眩晕时不能加速
        heat = Math.min(100, heat + HEAT_INCREASE_RATE * deltaTime);
        if (heat >= 100) {
            triggerOverheat();
        }
    } else {
        heat = Math.max(0, heat - HEAT_DECREASE_RATE * deltaTime);
    }
    updateHeatBar();

    // 抓钩下落
    if (gameState === 'dropping') {
        let currentBottom = parseFloat(claw.style.bottom);
        claw.style.bottom = `${currentBottom - CLAW_SPEED_DROP / 10}%`;
        checkCollisions();
        if (parseFloat(claw.style.bottom) <= 5) {
            claw.style.bottom = '5%';
            gameState = 'retracting';
        }
    }

    // 抓钩回收
    if (gameState === 'retracting' || gameState === 'caught') {
        let retractSpeed = CLAW_SPEED_RETRACT_EMPTY;
        if (gameState === 'caught' && caughtDoll) {
            retractSpeed = CLAW_SPEED_RETRACT_BASE / caughtDoll.weight;
        }
        if (isBoosting) {
            retractSpeed *= BOOST_MULTIPLIER;
        }

        let currentBottom = parseFloat(claw.style.bottom);
        claw.style.bottom = `${currentBottom + retractSpeed / 10}%`;
        
        if (caughtDoll) {
            const clawRect = claw.getBoundingClientRect();
            const playAreaRect = playArea.getBoundingClientRect();
            caughtDoll.element.style.top = `${clawRect.bottom - playAreaRect.top - 20}px`;
        }

        checkCollisions();

        // 回到顶部
        if (parseFloat(claw.style.bottom) >= 90) {
            claw.style.bottom = '90%';
            if (gameState === 'caught' && caughtDoll) {
                score += caughtDoll.value;
                createBomb();
                dolls = dolls.filter(d => d.element !== caughtDoll.element);
                caughtDoll.element.remove();
                caughtDoll = null;
            }
            gameState = 'ready';
            claw.classList.remove('grabbing');
            updateUI();
        }
    }
}

function checkCollisions() {
    const clawRect = claw.getBoundingClientRect();

    // 与炸弹碰撞
    for (const bomb of bombs) {
        if (bomb.isDestroyed) continue;
        const bombRect = bomb.element.getBoundingClientRect();
        if (isColliding(clawRect, bombRect)) {
            if (isBoosting) {
                // 冲刺破坏！
                bomb.isDestroyed = true;
                bomb.element.remove(); // 暂时直接移除
                score += 10; // 奖励
                updateUI();
                console.log("炸弹被摧毁!");
            } else {
                // 普通碰撞
                loseLife();
            }
            return;
        }
    }

    // 与玩偶碰撞 (仅下落时)
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
    
function isColliding(rect1, rect2) { /* ...此函数不变... */ return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom); }

function grabDoll(doll) {
    gameState = 'caught';
    caughtDoll = doll;
    doll.isCaught = true;
    claw.classList.add('grabbing');
    const clawRect = claw.getBoundingClientRect();
    const playAreaRect = playArea.getBoundingClientRect();
    doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth)/2}px`;
}

function triggerOverheat() {
    console.log("过热了！");
    isBoosting = false; // 停止加速
    heat = 0; // 热度清零
    updateHeatBar();

    // 如果抓着娃娃，娃娃掉落
    if (caughtDoll) {
        claw.classList.remove('grabbing');
        // M2 改进：让娃娃掉回原位
        // 我们需要一个地方存储娃娃被抓前的原始位置
        // 这里我们先简化处理：直接移除
        dolls = dolls.filter(d => d.element !== caughtDoll.element);
        caughtDoll.element.remove();
        caughtDoll = null;
    }

    // 进入眩晕状态
    gameState = 'stunned';
    // (可选)给爪子一个冒烟或电火花的class来显示眩晕
    setTimeout(() => {
        // 眩晕结束后，如果爪子在半空中，则继续回收
        if (parseFloat(claw.style.bottom) < 90) {
            gameState = 'retracting';
        } else {
            gameState = 'ready';
        }
    }, 1500); // 眩晕1.5秒
}

function loseLife() {
    if (isInvincible) return;
    isInvincible = true;
    lives--;
    updateUI();
    
    playArea.style.animation = 'flash 0.3s';
    setTimeout(() => playArea.style.animation = '', 300);

    if (caughtDoll) {
        // M1 简化版：彩蛋直接消失，但不扣血（或只扣少量血）
        // 这里我们还是按扣血算，但彩蛋消失
        dolls = dolls.filter(d => d.element !== caughtDoll.element);
        caughtDoll.element.remove();
        caughtDoll = null;
        console.log("彩蛋被毁了！");
    }
    
    gameState = 'retracting';
    claw.classList.remove('grabbing');
    
    if (lives <= 0) {
        gameOver('生命耗尽!');
    }

    setTimeout(() => { isInvincible = false; }, 500);
}

function gameOver(message) { /* ...此函数不变... */ gameState = 'over'; clearInterval(timerInterval); messageText.textContent = message; messageOverlay.classList.remove('hidden'); }

// 动态添加闪烁动画样式
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes flash { 0%, 100% { background-color: rgba(199, 0, 57, 0.3); } 50% { background-color: rgba(199, 0, 57, 0.7); }}`;
document.head.appendChild(styleSheet);

// 启动游戏
initGame();