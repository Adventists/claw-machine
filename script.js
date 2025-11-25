// --- DOM 元素获取 ---
const playArea = document.getElementById('play-area');
const clawAssembly = document.getElementById('claw-assembly');
const claw = document.getElementById('claw');
const joystickHandle = document.getElementById('joystick-handle');
const joystickBase = document.querySelector('.joystick-base');
const joystickPrompt = document.getElementById('joystick-prompt');
const dropButton = document.getElementById('drop-button');
const bombContainer = document.getElementById('bomb-container');

const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');

// --- 游戏状态变量 ---
let gameState = 'ready'; // ready, dropping, retracting, caught, over
let score = 0;
let lives = 3;
let timeLeft = 60;
let timerInterval;

let dolls = [];
let bombs = [];
let caughtDoll = null;
let isInvincible = false;

// --- 游戏参数配置 ---
const CLAW_SPEED_DROP = 5;
const CLAW_SPEED_RETRACT_EMPTY = 6;
const CLAW_SPEED_RETRACT_BASE = 4;
const PLAY_AREA_WIDTH = playArea.offsetWidth;
const PLAY_AREA_HEIGHT = playArea.offsetHeight;
const CLAW_ASSEMBLY_WIDTH = clawAssembly.offsetWidth;

// --- 摇杆控制 ---
let isDragging = false;
let isControllingSpeed = false;
const MAX_JOYSTICK_ANGLE = 30;

joystickHandle.addEventListener('mousedown', (e) => {
    if (gameState === 'ready') {
        isDragging = true;
        joystickHandle.style.cursor = 'grabbing';
        joystickPrompt.classList.add('hidden');
    } else if (gameState === 'retracting' || gameState === 'caught') {
        isControllingSpeed = true;
        joystickHandle.style.cursor = 'grabbing';
        joystickPrompt.classList.add('hidden');
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    isControllingSpeed = false;
    joystickHandle.style.cursor = 'grab';
    joystickHandle.style.transform = 'rotate(0deg)';
    if (gameState === 'retracting' || gameState === 'caught') {
        joystickPrompt.classList.remove('hidden');
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging && !isControllingSpeed) return;

    const baseRect = joystickBase.getBoundingClientRect();
    const mouseX = e.clientX;
    const baseX = baseRect.left + baseRect.width / 2;
    const offsetX = mouseX - baseX;
    const maxOffset = baseRect.width / 2;
    let angle = (offsetX / maxOffset) * MAX_JOYSTICK_ANGLE;
    angle = Math.max(-MAX_JOYSTICK_ANGLE, Math.min(MAX_JOYSTICK_ANGLE, angle));
    
    joystickHandle.style.transform = `rotate(${angle}deg)`;

    if (isDragging) {
        const clawMinX = 0;
        const clawMaxX = PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH;
        const clawX = ((angle + MAX_JOYSTICK_ANGLE) / (2 * MAX_JOYSTICK_ANGLE)) * (clawMaxX - clawMinX) + clawMinX;
        clawAssembly.style.left = `${clawX}px`;
    } 
});

// --- 游戏核心逻辑 ---
function initGame() {
    gameState = 'ready';
    score = 0;
    lives = 3;
    timeLeft = 60;
    caughtDoll = null;
    isInvincible = false;

    updateUI();
    messageOverlay.classList.add('hidden');
    joystickPrompt.classList.add('hidden');
    
    playArea.querySelectorAll('.doll').forEach(d => d.remove());
    dolls = [];
    bombContainer.innerHTML = '';
    bombs = [];
    clearInterval(timerInterval);

    createDolls();
    createBomb();
    
    clawAssembly.style.left = `calc(50% - ${CLAW_ASSEMBLY_WIDTH / 2}px)`;
    joystickHandle.style.transform = 'rotate(0deg)';
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

    requestAnimationFrame(gameLoop);
}

function createDolls() {
    const dollTypes = [
        { class: 'green', weight: 1.0, value: 80,  size: 0.9 },
        { class: 'purple', weight: 1.8, value: 200, size: 1.2 },
        { class: 'green', weight: 1.2, value: 100, size: 1.0 },
        { class: 'purple', weight: 2.0, value: 250, size: 1.3 },
        { class: 'green', weight: 1.5, value: 150, size: 1.1 },
    ];

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

function createBomb() {
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
    bombs.push({ element: bombEl });
}

function updateUI() {
    timerDisplay.textContent = `时间: ${timeLeft}`;
    scoreDisplay.textContent = `金钱: $${Math.floor(score)}`;
    livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives);
}

dropButton.addEventListener('click', () => {
    if (gameState === 'ready') {
        dropClaw();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        initGame();
    }
});

function dropClaw() {
    gameState = 'dropping';
}

function gameLoop() {
    if (gameState === 'dropping') {
        let currentBottom = parseFloat(claw.style.bottom);
        claw.style.bottom = `${currentBottom - CLAW_SPEED_DROP / 10}%`;
        checkCollisions();
        if (parseFloat(claw.style.bottom) <= 5) {
            claw.style.bottom = '5%';
            gameState = 'retracting';
            joystickPrompt.classList.remove('hidden');
        }
    }

    if (gameState === 'retracting' || gameState === 'caught') {
        let retractSpeed = CLAW_SPEED_RETRACT_EMPTY;
        if (gameState === 'caught' && caughtDoll) {
            retractSpeed = CLAW_SPEED_RETRACT_BASE / caughtDoll.weight;
        }

        if (isControllingSpeed) {
            const transform = joystickHandle.style.transform;
            const currentAngleMatch = transform.match(/rotate\((.+)deg\)/);
            if (currentAngleMatch && currentAngleMatch[1]) {
                const currentAngle = parseFloat(currentAngleMatch[1]);
                if (currentAngle > 5) {
                    retractSpeed *= 2.0;
                    joystickPrompt.textContent = '»» 加速';
                } else if (currentAngle < -5) {
                    retractSpeed *= 0.5;
                    joystickPrompt.textContent = '«« 减速';
                } else {
                    joystickPrompt.textContent = '– 保持 –';
                }
            }
        } else {
            joystickPrompt.textContent = '» 加速';
        }

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
            joystickPrompt.classList.add('hidden');
            updateUI();
        }
    }
    
    if (gameState !== 'over') {
        requestAnimationFrame(gameLoop);
    }
}

function checkCollisions() {
    const clawRect = claw.getBoundingClientRect();
    for (const bomb of bombs) {
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

function isColliding(rect1, rect2) {
    return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
}

function grabDoll(doll) {
    gameState = 'caught';
    caughtDoll = doll;
    doll.isCaught = true;
    claw.classList.add('grabbing');
    joystickPrompt.classList.remove('hidden');
    const clawRect = claw.getBoundingClientRect();
    const playAreaRect = playArea.getBoundingClientRect();
    doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth)/2}px`;
}

function loseLife() {
    if (isInvincible) return;
    isInvincible = true;
    lives--;
    updateUI();
    
    playArea.style.animation = 'flash 0.3s';
    setTimeout(() => playArea.style.animation = '', 300);

    if (caughtDoll) {
        caughtDoll.element.remove();
        dolls = dolls.filter(d => d !== caughtDoll);
        caughtDoll = null;
    }
    
    gameState = 'retracting';
    claw.classList.remove('grabbing');
    joystickPrompt.classList.remove('hidden');
    
    if (lives <= 0) {
        gameOver('生命耗尽!');
    }

    setTimeout(() => { isInvincible = false; }, 500);
}

function gameOver(message) {
    gameState = 'over';
    clearInterval(timerInterval);
    messageText.textContent = message;
    messageOverlay.classList.remove('hidden');
}

// 动态添加闪烁动画样式
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes flash {
    0%, 100% { background-color: rgba(199, 0, 57, 0.3); }
    50% { background-color: rgba(199, 0, 57, 0.7); }
}`;
document.head.appendChild(styleSheet);


// 启动游戏
initGame();