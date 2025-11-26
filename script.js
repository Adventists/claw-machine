// --- DOM 元素获取 ---
const gameContainer = document.getElementById('game-container');
const playArea = document.getElementById('play-area');
const clawAssembly = document.getElementById('claw-assembly');
const claw = document.getElementById('claw');
const bombContainer = document.getElementById('bomb-container');
const heatBar = document.getElementById('heat-bar');
const stunIndicator = document.getElementById('stun-indicator');

const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');

const winOverlay = document.getElementById('win-overlay');
const winPrompt = document.getElementById('win-prompt');
const eggSelectionContainer = document.getElementById('egg-selection-container');
const rewardDisplay = document.getElementById('reward-display');
const rewardAnimal = document.getElementById('reward-animal');
const rewardName = document.getElementById('reward-name');
const winButtonsContainer = document.getElementById('win-buttons-container');

const scoreTargetDisplay = document.getElementById('score-target');// 新增：显示目标分数

// --- 游戏状态变量 ---
let gameState = 'ready'; // ready, aiming, dropping, retracting, caught, stunned, over
let score = 0, lives = 3, timeLeft = 0, heat = 0;
let dolls = [], bombs = [], caughtDoll = null, isInvincible = false; 
let isAiming = false, isBoosting = false; // 控制抓钩瞄准和加速状态
let caughtDollOriginalPos = { left: 0, bottom: 0 }; // 用于记录抓到的蛋的位置
let timerInterval; // 用于计时的间隔器
let caughtDollsHistory = []; // 新增：用于记录本关抓到的所有蛋

// --- 游戏参数配置 (在这里调整游戏手感和难度) ---
const INITIAL_TIME = 60;          // 初始游戏时间（秒）
const WIN_SCORE = 100;            // 胜利所需达到的最低分数
const CLAW_SPEED_DROP = 7;        // 抓钩下落速度 (数值越大越快)
const CLAW_SPEED_RETRACT_EMPTY = 6; // 空抓钩回收速度 (数值越大越快)
const CLAW_SPEED_RETRACT_BASE = 4;  // 抓到物体后的基础回收速度 (会被重量影响)
const BOOST_MULTIPLIER = 3.0;     // 按住加速时的速度倍率
const HEAT_INCREASE_RATE = 60;    // 每秒增加的热度 (数值越大，越容易过热)
const HEAT_DECREASE_RATE = 30;    // 每秒自然冷却的热度
const STUN_DURATION = 1500;       // 过热后的眩晕时间 (毫秒)

const PLAY_AREA_WIDTH = playArea.offsetWidth;
const PLAY_AREA_HEIGHT = playArea.offsetHeight;
const CLAW_ASSEMBLY_WIDTH = clawAssembly.offsetWidth;

// --- 输入逻辑 ---
gameContainer.addEventListener('mousedown', handlePointerDown);
gameContainer.addEventListener('touchstart', handlePointerDown, { passive: false });
gameContainer.addEventListener('mousemove', handlePointerMove);
gameContainer.addEventListener('touchmove', handlePointerMove, { passive: false });
document.addEventListener('mouseup', handlePointerUp);
document.addEventListener('touchend', handlePointerUp);

document.querySelectorAll('.restart-button').forEach(btn => btn.addEventListener('click', initGame));

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
    const pointerX = e.touches ? e.touches[0].clientX : e.clientX;
    const playAreaRect = playArea.getBoundingClientRect();
    let targetX = pointerX - playAreaRect.left - (CLAW_ASSEMBLY_WIDTH / 2);
    targetX = Math.max(0, Math.min(PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH, targetX));
    clawAssembly.style.left = `${targetX}px`;
    e.preventDefault();
}
function handlePointerUp(e) {
    if (isAiming) {
        isAiming = false;
        dropClaw(); // 调用恢复的函数
    }
    if (isBoosting) {
        isBoosting = false;
    }
    e.preventDefault();
}
document.addEventListener('keydown', (e) => { if (e.code === 'Escape') initGame(); });

// --- 游戏核心逻辑 ---

// 核心修复：恢复 dropClaw 函数
function dropClaw() {
    gameState = 'dropping';
}

function initGame() {
    gameState = 'ready';
    score = 0; lives = 3; timeLeft = INITIAL_TIME; heat = 0;
    updateHeatBar();
    caughtDoll = null; isInvincible = false; isAiming = false; isBoosting = false;
    scoreTargetDisplay.textContent = `/ $${WIN_SCORE}`; // 新增：更新目标分数显示
    
    updateUI();
    messageOverlay.classList.add('hidden');
    winOverlay.classList.add('hidden');
    stunIndicator.classList.add('hidden');

    playArea.querySelectorAll('.doll').forEach(d => d.remove());
    dolls = [];
    bombContainer.innerHTML = '';
    bombs = [];
    caughtDollsHistory = [];
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

    let lastTime = 0;
    function gameLoop(currentTime) {
        if (gameState === 'over') return;
        if (lastTime === 0) { lastTime = currentTime; requestAnimationFrame(gameLoop); return; }
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        updateGame(deltaTime);
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
    if (gameState === 'stunned') return;

    if (isBoosting) {
        heat = Math.min(100, heat + HEAT_INCREASE_RATE * deltaTime);
        if (heat >= 100) {
            triggerOverheat();
            return;
        }
    } else {
        heat = Math.max(0, heat - HEAT_DECREASE_RATE * deltaTime);
    }
    updateHeatBar();

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
        if (isBoosting) retractSpeed *= BOOST_MULTIPLIER;
        
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
            if (gameState === 'caught' && caughtDoll) handleCaughtDoll();
            gameState = 'ready';
            claw.classList.remove('grabbing');
            updateUI();
        }
    }
}

function handleCaughtDoll() {
    // 新增：记录抓到的蛋
    caughtDollsHistory.push(caughtDoll);

    let earnedValue = caughtDoll.value;
    switch (caughtDoll.type) {
        case 'time': timeLeft += 5; break;
        case 'cleaner':
            bombs.forEach(bomb => { if (!bomb.isDestroyed) { bomb.isDestroyed = true; bomb.element.remove(); } });
            bombs = [];
            break;
        case 'surprise':
            earnedValue = Math.random() < 0.5 ? 800 : 1;
            break;
    }
    score += earnedValue;
    createBomb();
    dolls = dolls.filter(d => d.element !== caughtDoll.element);
    caughtDoll.element.remove();
    caughtDoll = null;
}

function checkCollisions() {
    const clawRect = claw.getBoundingClientRect();
    for (const bomb of bombs) {
        if (bomb.isDestroyed) continue;
        const bombRect = bomb.element.getBoundingClientRect();
        if (isColliding(clawRect, bombRect)) {
            loseLife();
            return;
        }
    }
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
    
function grabDoll(doll) {
    gameState = 'caught';
    caughtDoll = doll;
    doll.isCaught = true;
    claw.classList.add('grabbing');
    caughtDollOriginalPos.left = doll.element.style.left;
    caughtDollOriginalPos.bottom = doll.element.style.bottom || '20px';
    const clawRect = claw.getBoundingClientRect();
    const playAreaRect = playArea.getBoundingClientRect();
    doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth) / 2}px`;
}

function dropCaughtDoll() {
    if (!caughtDoll) return;
    claw.classList.remove('grabbing');
    caughtDoll.isCaught = false;
    caughtDoll.element.style.left = caughtDollOriginalPos.left;
    caughtDoll.element.style.bottom = caughtDollOriginalPos.bottom;
    caughtDoll.element.style.top = '';
    caughtDoll = null;
}

function loseLife() {
    if (isInvincible) return;
    isInvincible = true;
    lives--;
    updateUI();
    if (caughtDoll) dropCaughtDoll();
    gameState = 'retracting';
    claw.classList.remove('grabbing');
    if (lives <= 0) {
        // 即使生命耗尽，也检查分数是否达标
        if (score >= WIN_SCORE) {
            gameOver('挑战成功!'); // 可以给一个不同的胜利消息
        } else {
            gameOver('生命耗尽!');
        }
    }
    setTimeout(() => { isInvincible = false; }, 500);    setTimeout(() => { isInvincible = false; }, 500);
}

function triggerOverheat() {
    isBoosting = false;
    gameState = 'stunned';
    if (caughtDoll) dropCaughtDoll();
    let flickerInterval, heatDropInterval;
    stunIndicator.classList.remove('hidden');
    flickerInterval = setInterval(() => {
        claw.style.borderColor = claw.style.borderColor === 'rgb(255, 0, 0)' ? '#553322' : '#f00';
        heatBar.style.background = heatBar.style.background === 'rgb(255, 77, 77)' ? 'linear-gradient(to top, rgb(243, 156, 18), rgb(241, 196, 15), rgb(230, 126, 34), rgb(211, 84, 0), rgb(192, 57, 43))' : 'rgb(255, 77, 77)';
    }, 150);
    heatDropInterval = setInterval(() => {
        heat = Math.max(0, heat - (100 / (STUN_DURATION / 50)));
        updateHeatBar();
    }, 50);
    setTimeout(() => {
        clearInterval(flickerInterval);
        clearInterval(heatDropInterval);
        stunIndicator.classList.add('hidden');
        heat = 0;
        updateHeatBar();
        claw.style.borderColor = '';
        heatBar.style.background = '';
        gameState = parseFloat(claw.style.bottom) < 90 ? 'retracting' : 'ready';
    }, STUN_DURATION);
}

function gameOver(message) {
    gameState = 'over';
    clearInterval(timerInterval);
    if (timeLeft <= 0 && score >= WIN_SCORE) {
        showWinScreen();
    } else {
        messageText.textContent = message;
        messageOverlay.classList.remove('hidden');
    }
}

function showWinScreen() {
    winOverlay.classList.remove('hidden');
    eggSelectionContainer.innerHTML = '';
    rewardDisplay.classList.add('hidden');
    winButtonsContainer.classList.add('hidden');
    eggSelectionContainer.classList.remove('hidden');
    winPrompt.classList.remove('hidden');
    winPrompt.textContent = "恭喜！请选择一个战利品来开启最终奖励！";

    // 如果一个蛋都没抓到，也给一个默认的蛋
    if (caughtDollsHistory.length === 0) {
        caughtDollsHistory.push({ class: 'green', type: 'normal' }); // 提供一个安慰奖
    }

    // 创建所有抓到的蛋作为可选项
    caughtDollsHistory.forEach(dollData => {
        const eggEl = document.createElement('div');
        // 从 dollData 中获取 class, 而不是写死
        const dollClass = dollData.element ? dollData.element.className.replace('doll', '').trim() : dollData.class;
        eggEl.className = `selectable-egg doll ${dollClass}`;
        
        // 关键：为每个蛋绑定自己的点击事件，并传入所有蛋的 DOM 元素
        const allEggElements = Array.from(eggSelectionContainer.childNodes);
        eggEl.addEventListener('click', (event) => openEgg(event.currentTarget, allEggElements), { once: true });
        
        eggSelectionContainer.appendChild(eggEl);
    });
}

function openEgg(selectedEgg, allEggs) {
    // 1. 让所有蛋都不可再点击，并且除了选中的，其他都消失
    allEggs.forEach(egg => {
        if (egg !== selectedEgg) {
            egg.style.display = 'none'; // 让其他蛋消失
        }
        egg.style.pointerEvents = 'none';
    });
    // 将选中的蛋移动到中央位置，准备“开奖动画”
    selectedEgg.style.position = 'absolute';
    selectedEgg.style.left = '50%';
    selectedEgg.style.top = '50%';
    selectedEgg.style.transform = 'translate(-50%, -50%) scale(1.5)';
    selectedEgg.style.transition = 'all 0.5s ease';

    // 隐藏提示文字
    winPrompt.classList.add('hidden');

    // 0.5秒后，蛋消失，显示奖励
    setTimeout(() => {
        selectedEgg.style.display = 'none'; // 蛋消失
        rewardDisplay.classList.remove('hidden');
        winButtonsContainer.classList.remove('hidden');

        // 定义奖励池
        const commonAnimals = [{ name: "小绿龙", emoji: "🐲" }, { name: "紫仓鼠", emoji: "🐹" }, { name: "蓝企鹅", emoji: "🐧" }, { name: "粉红兔", emoji: "🐰" }, { name: "棕熊熊", emoji: "🐻" }];
        const rareAnimal = { name: "✨黄金鸡✨", emoji: "🐥", rare: true };
        const finalReward = Math.random() < 0.05 ? rareAnimal : commonAnimals[Math.floor(Math.random() * commonAnimals.length)];
        
        rewardAnimal.textContent = finalReward.emoji;
        rewardName.textContent = finalReward.name;
        rewardName.classList.toggle('rare', finalReward.rare);
    }, 500);
}

// --- 工具函数 ---
function updateUI() { 
    timerDisplay.textContent = `时间: ${timeLeft}`; 
    scoreDisplay.textContent = `金钱: $${Math.floor(score)}`; 
    livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives);

    // 新增：更新目标分数颜色
    if (score >= WIN_SCORE) {
        scoreTargetDisplay.style.color = '#f1c40f'; // 变为金色
    } else {
        scoreTargetDisplay.style.color = '#aaa'; // 恢复灰色
    }
}
function updateHeatBar() { heatBar.style.height = `${heat}%`; }
function createDolls() { const normalDolls = [{ type: 'normal', class: 'green', weight: 1.0, value: 80, size: 0.9 }, { type: 'normal', class: 'purple', weight: 1.8, value: 200, size: 1.2 }, { type: 'normal', class: 'green', weight: 1.2, value: 100, size: 1.0 }, ]; const specialDolls = [{ type: 'heavy', class: 'heavy', weight: 3.0, value: 500, size: 1.4 }, { type: 'time', class: 'time', weight: 0.8, value: 50, size: 0.8 }, { type: 'cleaner', class: 'cleaner', weight: 1.5, value: 150, size: 1.0 }, { type: 'surprise', class: 'surprise', weight: 1.0, value: 0, size: 1.0 }, ]; let dollTypes = []; for (let i = 0; i < 5; i++) { if (Math.random() < 0.7) { dollTypes.push(normalDolls[Math.floor(Math.random() * normalDolls.length)]); } else { dollTypes.push(specialDolls[Math.floor(Math.random() * specialDolls.length)]); } } dollTypes.forEach((type, index) => { const dollEl = document.createElement('div'); dollEl.classList.add('doll', type.class); const baseWidth = 50, baseHeight = 70; dollEl.style.width = `${baseWidth * type.size}px`; dollEl.style.height = `${baseHeight * type.size}px`; const xPos = 20 + index * (PLAY_AREA_WIDTH / (dollTypes.length - 0.5)); dollEl.style.left = `${xPos}px`; playArea.appendChild(dollEl); dolls.push({ element: dollEl, type: type.type, weight: type.weight, value: type.value, isCaught: false }); }); }

// 核心修复：重写 createBomb 函数
function createBomb() {
    const bombEl = document.createElement('div');
    bombEl.classList.add('bomb');
    const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300);
    bombEl.style.top = `${randomTop}px`;
    
    const animationDuration = (6 + Math.random() * 4) + 's';
    // 随机选用一个预定义的动画名
    const animationName = Math.random() < 0.5 ? 'moveLeftToRight' : 'moveRightToLeft';
    
    // 直接通过 style.animation 属性应用
    bombEl.style.animation = `${animationName} ${animationDuration} linear infinite alternate`;
    
    bombContainer.appendChild(bombEl);
    bombs.push({ element: bombEl, isDestroyed: false });
}

function isColliding(rect1, rect2) { return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom); }

// --- 启动游戏 ---
initGame();