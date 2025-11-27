// 终极解决方案：将所有代码包裹在 DOMContentLoaded 事件中
// 这确保了在执行任何 JS 代码之前，整个 HTML 页面都已准备就绪。
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const gameContainer = document.getElementById('game-container');
    const playArea = document.getElementById('play-area');
    const clawAssembly = document.getElementById('claw-assembly');
    const claw = document.getElementById('claw');
    const bombContainer = document.getElementById('bomb-container');
    const heatBar = document.getElementById('heat-bar');
    const stunIndicator = document.getElementById('stun-indicator');
    const instructionText = document.getElementById('instruction-text');
    const timerDisplay = document.getElementById('timer');
    const scoreDisplay = document.getElementById('score');
    const scoreTargetDisplay = document.getElementById('score-target');
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

    // --- 游戏状态变量 ---
    let gameState, score, lives, timeLeft, heat;
    let dolls, bombs, caughtDoll, isInvincible;
    let isAiming, isBoosting;
    let caughtDollOriginalPos;
    let caughtDollsHistory;
    let timerInterval;

    // --- 游戏参数配置 (在这里调整游戏手感和难度) ---
    const INITIAL_TIME = 30;
    const WIN_SCORE = 100;
    const CLAW_SPEED_DROP = 15;
    const CLAW_SPEED_RETRACT_EMPTY = 8;
    const CLAW_SPEED_RETRACT_BASE = 4;
    const BOOST_MULTIPLIER = 3.0;
    const HEAT_INCREASE_RATE = 60;
    const HEAT_DECREASE_RATE = 30;
    const STUN_DURATION = 1500;
    const DROP_TO_ORIGIN = false;

    // --- 常量 ---
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
    document.addEventListener('keydown', (e) => { if (e.code === 'Escape') initGame(); });

    function handlePointerDown(e) {
        if (gameState === 'ready') { isAiming = true; gameState = 'aiming'; }
        else if (gameState === 'retracting' || gameState === 'caught') { isBoosting = true; }
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
        if (isAiming) { isAiming = false; dropClaw(); }
        if (isBoosting) { isBoosting = false; }
        e.preventDefault();
    }
    
    // --- 游戏核心逻辑 ---
    function dropClaw() { gameState = 'dropping'; }

    function initGame() {
        gameState = 'ready';
        score = 0; lives = 3; timeLeft = INITIAL_TIME; heat = 0;
        dolls = []; bombs = []; caughtDoll = null; isInvincible = false;
        isAiming = false; isBoosting = false;
        caughtDollOriginalPos = { left: 0, bottom: 0 };
        caughtDollsHistory = [];

        updateHeatBar();
        scoreTargetDisplay.textContent = `/ $${WIN_SCORE}`;
        updateUI();
        updateInstruction();
        messageOverlay.classList.add('hidden');
        winOverlay.classList.add('hidden');
        stunIndicator.classList.add('hidden');

        playArea.querySelectorAll('.doll, .effect-text').forEach(el => el.remove());
        bombContainer.innerHTML = '';
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
                if (timeLeft <= 0) gameOver('时间到!');
            }
        }, 1000);

        let lastTime = 0;
        function gameLoop(currentTime) {
            if (gameState === 'over') return;
            if (!lastTime) lastTime = currentTime;
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;
            updateGame(deltaTime);
            requestAnimationFrame(gameLoop);
        }
        requestAnimationFrame(gameLoop);
    }

    function updateGame(deltaTime) {
        updateInstruction();
        if (gameState === 'stunned') return;

        if (isBoosting) {
            heat = Math.min(100, heat + HEAT_INCREASE_RATE * deltaTime);
            if (heat >= 100) { triggerOverheat(); return; }
        } else {
            heat = Math.max(0, heat - HEAT_DECREASE_RATE * deltaTime);
        }
        updateHeatBar();

        if (gameState === 'dropping') {
            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom - CLAW_SPEED_DROP / 10}%`;
            checkCollisions();
            if (parseFloat(claw.style.bottom) <= 5) { claw.style.bottom = '5%'; gameState = 'retracting'; }
        }

        if (gameState === 'retracting' || gameState === 'caught') {
            let retractSpeed = caughtDoll ? (CLAW_SPEED_RETRACT_BASE / caughtDoll.weight) : CLAW_SPEED_RETRACT_EMPTY;
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
                if (caughtDoll) handleCaughtDoll();
                gameState = 'ready';
                claw.classList.remove('grabbing');
                updateUI();
            }
        }
    }

    function handleCaughtDoll() {
        caughtDollsHistory.push({ ...caughtDoll, class: caughtDoll.element.className.replace('doll', '').trim() });
        let earnedValue = caughtDoll.value;
        let effectText = '';

        switch (caughtDoll.type) {
            case 'time': timeLeft += 5; effectText = '时间 +5s!'; break;
            case 'cleaner':
                bombs.forEach(bomb => { if (!bomb.isDestroyed) { bomb.isDestroyed = true; bomb.element.remove(); } });
                bombs = []; effectText = '炸弹清屏!'; break;
            case 'surprise':
                if (Math.random() < 0.5) { earnedValue = 800; effectText = '大惊喜! +$800'; }
                else { earnedValue = 1; effectText = '坏运气... +$1'; }
                break;
        }

        if (effectText) showEffectText(effectText);
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
            if (isColliding(clawRect, bombRect)) { loseLife(); return; }
        }
        if (gameState === 'dropping') {
            for (const doll of dolls) {
                if (doll.isCaught) continue;
                const dollRect = doll.element.getBoundingClientRect();
                if (isColliding(clawRect, dollRect)) { grabDoll(doll); return; }
            }
        }
    }

    function grabDoll(doll) {
        gameState = 'caught'; caughtDoll = doll; doll.isCaught = true;
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
        if (DROP_TO_ORIGIN) {
            caughtDoll.element.style.left = caughtDollOriginalPos.left;
            caughtDoll.element.style.bottom = caughtDollOriginalPos.bottom;
        } else {
            const playAreaRect = playArea.getBoundingClientRect();
            const dollRect = caughtDoll.element.getBoundingClientRect();
            caughtDoll.element.style.left = `${dollRect.left - playAreaRect.left}px`;
            caughtDoll.element.style.bottom = `${playAreaRect.bottom - dollRect.bottom}px`;
        }
        caughtDoll.element.style.top = '';
        caughtDoll = null;
    }

    function loseLife() {
        if (isInvincible) return;
        playArea.style.animation = 'flash 0.3s ease-in-out';
        setTimeout(() => { playArea.style.animation = ''; }, 300);
        isInvincible = true;
        lives--;
        updateUI();
        if (caughtDoll) dropCaughtDoll();
        gameState = 'retracting';
        claw.classList.remove('grabbing');
        if (lives <= 0) {
            if (score >= WIN_SCORE) gameOver('挑战成功!');
            else gameOver('生命耗尽!');
        }
        setTimeout(() => { isInvincible = false; }, 500);
    }

    function triggerOverheat() {
        isBoosting = false; gameState = 'stunned';
        if (caughtDoll) dropCaughtDoll();
        
        stunIndicator.classList.remove('hidden');
        let flickerInterval = setInterval(() => {
            claw.style.borderColor = claw.style.borderColor === 'rgb(255, 0, 0)' ? '#553322' : '#f00';
            heatBar.style.background = heatBar.style.background === 'rgb(255, 77, 77)' ? 'linear-gradient(to top, rgb(243, 156, 18), rgb(241, 196, 15), rgb(230, 126, 34), rgb(211, 84, 0), rgb(192, 57, 43))' : 'rgb(255, 77, 77)';
        }, 150);

        let heatDropInterval = setInterval(() => {
            heat = Math.max(0, heat - (100 / (STUN_DURATION / 50)));
            updateHeatBar();
        }, 50);

        setTimeout(() => {
            clearInterval(flickerInterval); clearInterval(heatDropInterval);
            stunIndicator.classList.add('hidden');
            heat = 0; updateHeatBar();
            claw.style.borderColor = ''; heatBar.style.background = '';
            gameState = parseFloat(claw.style.bottom) < 90 ? 'retracting' : 'ready';
        }, STUN_DURATION);
    }

    function gameOver(message) {
        gameState = 'over';
        clearInterval(timerInterval);
        if ((timeLeft <= 0 || lives <= 0) && score >= WIN_SCORE) {
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
        if (caughtDollsHistory.length === 0) caughtDollsHistory.push({ class: 'green', type: 'normal' });
        caughtDollsHistory.forEach(dollData => {
            const eggEl = document.createElement('div');
            eggEl.className = `selectable-egg doll ${dollData.class}`;
            eggEl.addEventListener('click', (event) => {
                const allEggElements = Array.from(eggSelectionContainer.children);
                openEgg(event.currentTarget, allEggElements);
            }, { once: true });
            eggSelectionContainer.appendChild(eggEl);
        });
    }

    function openEgg(selectedEgg, allEggs) {
        allEggs.forEach(egg => {
            if (egg !== selectedEgg) egg.style.display = 'none';
            egg.style.pointerEvents = 'none';
        });
        eggSelectionContainer.style.height = `${selectedEgg.offsetHeight}px`;
        eggSelectionContainer.style.alignItems = 'center';
        selectedEgg.style.position = 'absolute';
        selectedEgg.style.left = '50%';
        selectedEgg.style.top = '50%';
        selectedEgg.style.transform = 'translate(-50%, -50%) scale(1.5)';
        selectedEgg.style.transition = 'all 0.5s ease';
        winPrompt.classList.add('hidden');
        setTimeout(() => {
            selectedEgg.style.display = 'none';
            rewardDisplay.classList.remove('hidden');
            winButtonsContainer.classList.remove('hidden');
            const commonAnimals = [{ name: "小绿龙", emoji: "🐲" }, { name: "紫仓鼠", emoji: "🐹" }, { name: "蓝企鹅", emoji: "🐧" }, { name: "粉红兔", emoji: "🐰" }, { name: "棕熊熊", emoji: "🐻" }];
            const rareAnimal = { name: "✨黄金鸡✨", emoji: "🐥", rare: true };
            const finalReward = Math.random() < 0.05 ? rareAnimal : commonAnimals[Math.floor(Math.random() * commonAnimals.length)];
            rewardAnimal.textContent = finalReward.emoji;
            rewardName.textContent = finalReward.name;
            rewardName.classList.toggle('rare', finalReward.rare);
        }, 500);
    }

    function updateUI() { timerDisplay.textContent = `时间: ${timeLeft}`; scoreDisplay.textContent = `金钱: $${Math.floor(score)}`; livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives); scoreTargetDisplay.style.color = (score >= WIN_SCORE) ? '#f1c40f' : '#aaa'; }
    function updateHeatBar() { heatBar.style.height = `${heat}%`; }
    function createDolls() { const normalDolls = [{ type: 'normal', class: 'green', weight: 1.0, value: 80, size: 0.9 }, { type: 'normal', class: 'purple', weight: 1.8, value: 200, size: 1.2 }, { type: 'normal', class: 'green', weight: 1.2, value: 100, size: 1.0 }, ]; const specialDolls = [{ type: 'heavy', class: 'heavy', weight: 3.0, value: 500, size: 1.4 }, { type: 'time', class: 'time', weight: 0.8, value: 50, size: 0.8 }, { type: 'cleaner', class: 'cleaner', weight: 1.5, value: 150, size: 1.0 }, { type: 'surprise', class: 'surprise', weight: 1.0, value: 0, size: 1.0 }, ]; let dollTypes = []; for (let i = 0; i < 5; i++) { if (Math.random() < 0.7) { dollTypes.push({ ...normalDolls[Math.floor(Math.random() * normalDolls.length)] }); } else { dollTypes.push({ ...specialDolls[Math.floor(Math.random() * specialDolls.length)] }); } } dollTypes.forEach((type, index) => { const dollEl = document.createElement('div'); dollEl.classList.add('doll', type.class); const baseWidth = 50, baseHeight = 70; dollEl.style.width = `${baseWidth * type.size}px`; dollEl.style.height = `${baseHeight * type.size}px`; const xPos = 20 + index * (PLAY_AREA_WIDTH / (dollTypes.length - 0.5)); dollEl.style.left = `${xPos}px`; playArea.appendChild(dollEl); dolls.push({ element: dollEl, type: type.type, weight: type.weight, value: type.value, isCaught: false }); }); }
    function createBomb() { const bombEl = document.createElement('div'); bombEl.classList.add('bomb'); const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300); bombEl.style.top = `${randomTop}px`; const animationDuration = (6 + Math.random() * 4) + 's'; const animationName = Math.random() < 0.5 ? 'moveLeftToRight' : 'moveRightToLeft'; bombEl.style.animation = `${animationName} ${animationDuration} linear infinite alternate`; bombContainer.appendChild(bombEl); bombs.push({ element: bombEl, isDestroyed: false }); }
    function isColliding(rect1, rect2) { return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom); }
    function showEffectText(text) { const textEl = document.createElement('div'); textEl.className = 'effect-text'; textEl.textContent = text; const clawRect = claw.getBoundingClientRect(); const playAreaRect = playArea.getBoundingClientRect(); textEl.style.left = `${clawRect.left - playAreaRect.left}px`; textEl.style.top = `${clawRect.top - playAreaRect.top - 40}px`; playArea.appendChild(textEl); setTimeout(() => { textEl.remove(); }, 1500); }
    function updateInstruction() { switch(gameState) { case 'ready': case 'aiming': instructionText.textContent = '按住拖动瞄准，松手下落'; break; case 'retracting': case 'caught': instructionText.textContent = '按住加速 (小心过热！)'; break; default: instructionText.textContent = ''; break; } }
    
    // --- 启动游戏 ---
    initGame();

}); // 这是 DOMContentLoaded 的结束括号
