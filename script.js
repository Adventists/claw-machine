// 使用 DOMContentLoaded 确保所有HTML元素加载完毕再执行JS
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const gameContainer = document.getElementById('game-container');
    const playArea = document.getElementById('play-area');
    const clawAssembly = document.getElementById('claw-assembly');
    const claw = document.getElementById('claw');
    const buffContainer = document.getElementById('buff-container');
    const boostBar = document.getElementById('boost-bar');
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
    let gameState, score, lives, timeLeft, fuel;
    let dolls, crystals, caughtDoll, isInvincible; // 加回 isInvincible
    let isAiming, isBoosting, isSuperClaw; // 修正语法并新增
    let caughtDollsHistory;
    let timerInterval;

    // --- 游戏参数配置 (在这里调整游戏手感和难度) ---
    const INITIAL_TIME = 30;                 // 初始游戏时间（秒）
    const WIN_SCORE = 100;                 // 胜利所需达到的最低分数
    const CLAW_SPEED_DROP = 15;                // 抓钩下落速度 (数值越大越快)
    const CLAW_SPEED_RETRACT_EMPTY = 8;    // 空抓钩回收速度 (数值越大越快)
    const CLAW_SPEED_RETRACT_BASE = 4;     // 抓到物体后的基础回收速度 (会被重量影响)
    const FUEL_FROM_BUFF = 100;            // 每个Buff提供的燃料值 (直接充满)
    const FUEL_CONSUME_RATE = 40;          // 按住加速时，每秒消耗的燃料
    const BOOST_SPEED_MULTIPLIER = 2.5;    // 固定加速倍率
    const STUN_DURATION = 1500;            // 抓钩损坏后的维修时间（毫秒）
    const GOLD_EGG_CHANCE = 0.1;           // 10% 概率出现金蛋
    const RAINBOW_EGG_CHANCE = 0.15;       // 15% 概率出现彩虹蛋

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
        if (gameState === 'ready') { gameState = 'aiming'; } 
        else if (gameState === 'retracting' || gameState === 'caught') { isBoosting = true; }
        e.preventDefault();
    }
    function handlePointerMove(e) {
        if (gameState !== 'aiming') return;
        const pointerX = e.touches ? e.touches[0].clientX : e.clientX;
        const playAreaRect = playArea.getBoundingClientRect();
        let targetX = pointerX - playAreaRect.left - (CLAW_ASSEMBLY_WIDTH / 2);
        targetX = Math.max(0, Math.min(PLAY_AREA_WIDTH - CLAW_ASSEMBLY_WIDTH, targetX));
        clawAssembly.style.left = `${targetX}px`;
        e.preventDefault();
    }
    function handlePointerUp(e) {
        if (gameState === 'aiming') dropClaw();
        isBoosting = false;
        e.preventDefault();
    }
    
    // --- 游戏核心逻辑 ---
    function dropClaw() {
        if (isSuperClaw) {
            isSuperClaw = false;
            claw.classList.remove('super-claw');
            showEffectText('超级抓钩!', 'gold');
        }
        gameState = 'dropping';
    }

    function initGame() {
        gameState = 'ready';
        score = 0; lives = 3; timeLeft = INITIAL_TIME; fuel = 0;
        dolls = []; crystals = []; caughtDoll = null;
        isInvincible = false;
        isAiming = false; isBoosting = false; isSuperClaw = false;
        caughtDollsHistory = [];

        updateBoostBar();
        scoreTargetDisplay.textContent = `/ $${WIN_SCORE}`;
        updateUI();
        updateInstruction();
        messageOverlay.classList.add('hidden');
        winOverlay.classList.add('hidden');

        playArea.querySelectorAll('.doll, .effect-text, .crystal').forEach(el => el.remove());
        clearInterval(timerInterval);

        createDolls();
        createCrystals(2);

        clawAssembly.style.left = `calc(50% - ${CLAW_ASSEMBLY_WIDTH / 2}px)`;
        claw.style.bottom = '90%';
        claw.classList.remove('grabbing');
        claw.classList.remove('super-claw');


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
        
        let isActuallyBoosting = false;
        if (isBoosting && fuel > 0 && (gameState === 'retracting' || gameState === 'caught')) {
            isActuallyBoosting = true;
            fuel = Math.max(0, fuel - FUEL_CONSUME_RATE * deltaTime);
        }
        updateBoostBar();

        if (gameState === 'dropping' || gameState === 'retracting' || gameState === 'caught') {
            let speed;
            if (gameState === 'dropping') {
                speed = -CLAW_SPEED_DROP;
            } else {
                speed = caughtDoll ? (CLAW_SPEED_RETRACT_BASE / caughtDoll.weight) : CLAW_SPEED_RETRACT_EMPTY;
                if (isActuallyBoosting) speed *= BOOST_SPEED_MULTIPLIER;
            }

            let currentBottom = parseFloat(claw.style.bottom);
            claw.style.bottom = `${currentBottom + speed / 10}%`;
            
            if (caughtDoll && gameState !== 'dropping') {
                const clawRect = claw.getBoundingClientRect();
                const playAreaRect = playArea.getBoundingClientRect();
                caughtDoll.element.style.top = `${clawRect.bottom - playAreaRect.top - 20}px`;
            }
            
            checkCollisions();

            if (currentBottom <= 5 && gameState === 'dropping') {
                claw.style.bottom = '5%';
                gameState = 'retracting';
            }
            if (currentBottom >= 90 && gameState !== 'dropping') {
                claw.style.bottom = '90%';

                // 超级抓钩结算
                if (caughtDollsHistory.length > 0 && !caughtDoll) { // 检查是否有超级抓钩抓到的蛋
                    let superClawScore = 0;
                    caughtDollsHistory.forEach(d => superClawScore += d.value);
                    score += superClawScore;
                    showEffectText(`+$${superClawScore}!`, 'gold');
                } 
                // 普通抓钩结算
                else if (caughtDoll) {
                    handleCaughtDoll();
                }
                
                gameState = 'ready';
                claw.classList.remove('grabbing');
                updateUI();
            }
        }
    }

    function handleCaughtDoll() {
        caughtDollsHistory.push({ ...caughtDoll, class: caughtDoll.element.className.replace('doll', '').trim() });
        let earnedValue = caughtDoll.value;

        switch (caughtDoll.type) {
            case 'gold-egg':
                showEffectText('全屏爆金币!', 'gold');
                dolls.forEach(d => {
                    if (!d.isCaught && d.element.style.display !== 'none') {
                        earnedValue += d.value;
                    }
                });
                break;
            case 'rainbow-egg':
                showEffectText('超级抓钩已准备!', 'special');
                isSuperClaw = true;
                claw.classList.add('super-claw');
                break;
        }

        score += earnedValue;
        createCrystals(1);
        dolls = dolls.filter(d => d.element !== caughtDoll.element);
        caughtDoll.element.remove();
        caughtDoll = null;
    }

    function checkCollisions() {
        const clawRect = claw.getBoundingClientRect();
        
        // 与水晶碰撞
        for (let i = crystals.length - 1; i >= 0; i--) {
            const crystal = crystals[i];
            if (crystal.isDestroyed) continue;
            const crystalRect = crystal.element.getBoundingClientRect();
            if (isColliding(clawRect, crystalRect)) {
                if (crystal.type === 'fuel') {
                    fuel = FUEL_FROM_BUFF;
                    updateBoostBar();
                    showEffectText('燃料补充!', 'info');
                } else if (crystal.type === 'danger' && (gameState === 'retracting' || gameState === 'caught')) {
                    triggerClawDamage();
                    return; // 立即返回
                }
                crystal.isDestroyed = true;
                crystal.element.remove();
                crystals.splice(i, 1);
            }
        }

        if (isSuperClaw && gameState === 'dropping') {
            // 超级抓钩的特殊碰撞检测
            for (const doll of dolls) {
                if (doll.isCaught) continue;
                const dollRect = doll.element.getBoundingClientRect();
                if (isColliding(clawRect, dollRect)) {
                    doll.isCaught = true;
                    showEffectText('吸附!', 'special');
                    doll.element.style.display = 'none';
                    // 直接计入历史，因为超级抓钩不会失败
                    caughtDollsHistory.push({ ...doll, class: doll.element.className.replace('doll', '').trim() });
                }
            }
        } else if (gameState === 'dropping') {
            // 普通与玩偶碰撞
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
        const clawRect = claw.getBoundingClientRect();
        const playAreaRect = playArea.getBoundingClientRect();
        doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth) / 2}px`;
    }

    function gameOver(message) {
        gameState = 'over';
        clearInterval(timerInterval);
        // 只在时间到时判断胜负
        if (timeLeft <= 0) {
            if (score >= WIN_SCORE) {
                showWinScreen();
            } else {
                messageText.textContent = message;
                messageOverlay.classList.remove('hidden');
            }
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

    // --- 工具函数 ---
    function updateUI() { timerDisplay.textContent = `时间: ${timeLeft}`; scoreDisplay.textContent = `金钱: $${Math.floor(score)}`; livesDisplay.textContent = '生命: ' + '♥ '.repeat(lives); scoreTargetDisplay.style.color = (score >= WIN_SCORE) ? '#f1c40f' : '#aaa'; }
    function updateBoostBar() { boostBar.style.opacity = fuel > 0 ? '1' : '0'; const fillPercent = fuel; boostBar.style.setProperty('--bar-width', `${fillPercent}%`); }

    function createDolls(count = 10) {
        dolls.forEach(d => d.element.remove());
        dolls = [];
        let dollPositions = [];
        
        for (let i = 0; i < count; i++) {
            let type;
            const rand = Math.random();
            if (rand < GOLD_EGG_CHANCE) {
                type = { type: 'gold-egg', class: 'gold-egg', weight: 3.0, value: 200, size: 1.2 };
            } else if (rand < GOLD_EGG_CHANCE + RAINBOW_EGG_CHANCE) {
                type = { type: 'rainbow-egg', class: 'rainbow-egg', weight: 1.5, value: 100, size: 1.0 };
            } else {
                type = { type: 'normal', class: Math.random() < 0.5 ? 'green' : 'purple', weight: 1.0, value: 50, size: 0.9 };
            }

            const dollEl = document.createElement('div');
            dollEl.classList.add('doll', type.class);
            const baseWidth = 50 * type.size;
            const baseHeight = 70 * type.size;
            dollEl.style.width = `${baseWidth}px`;
            dollEl.style.height = `${baseHeight}px`;

            let newPos, attempts = 0;
            do {
                const x = 10 + Math.random() * (PLAY_AREA_WIDTH - baseWidth - 20);
                const y = 20 + Math.random() * 100;
                newPos = { x, y, width: baseWidth, height: baseHeight };
                attempts++;
            } while (isOverlapping(newPos, dollPositions) && attempts < 20);
            
            dollPositions.push(newPos);
            dollEl.style.left = `${newPos.x}px`;
            dollEl.style.bottom = `${newPos.y}px`;

            playArea.appendChild(dollEl);
            dolls.push({ element: dollEl, ...type, isCaught: false });
        }
    }

    // 在 createDolls 下方添加 isOverlapping 辅助函数
    function isOverlapping(rect1, rects) {
        for (const rect2 of rects) {
            if (!(rect1.x + rect1.width < rect2.x || rect1.x > rect2.x + rect2.width ||
                rect1.y + rect1.height < rect2.y || rect1.y > rect2.y + rect2.height)) {
                return true;
            }
        }
        return false;
    }

    function createCrystals(count = 1) {
        for (let i = 0; i < count; i++) {
            const crystalEl = document.createElement('div');
            // 70% 概率是燃料，30% 是危险
            const type = Math.random() < 0.7 ? 'fuel' : 'danger';
            crystalEl.className = `crystal ${type}`;
            
            const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300);
            crystalEl.style.top = `${randomTop}px`;
            
            const animationDuration = (6 + Math.random() * 4) + 's';
            const animationName = Math.random() < 0.5 ? 'moveLeftToRight' : 'moveRightToLeft';
            
            crystalEl.style.animation = `${animationName} ${animationDuration} linear infinite alternate, buff-pulse 1.5s infinite`;
            
            playArea.appendChild(crystalEl);
            // 注意：这里我们推送到 crystals 数组
            crystals.push({ element: crystalEl, type: type, isDestroyed: false });
        }
    }

    function triggerClawDamage() {
        if (isInvincible) return;
        isInvincible = true;

        showEffectText('抓钩损坏!', 'danger');
        playArea.style.animation = 'flash 0.3s ease-in-out';
        setTimeout(() => { playArea.style.animation = ''; }, 300);

        if (caughtDoll) {
            dropCaughtDoll();
        }
        
        // 强制空抓回收，不再眩晕，只是中断操作
        gameState = 'retracting';
        claw.classList.remove('grabbing');
        
        // 在一段时间内无敌，防止连续触发
        setTimeout(() => { isInvincible = false; }, 500);
    }

    function isColliding(rect1, rect2) { return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom); }
    
    function showEffectText(text, type = 'info') {
        const textEl = document.createElement('div');
        textEl.className = 'effect-text';
        textEl.textContent = text;

        switch(type) {
            case 'gold': textEl.style.color = '#f1c40f'; break;
            case 'danger': textEl.style.color = '#e74c3c'; break;
            case 'special': textEl.style.color = '#3498db'; break;
        }
        
        const clawRect = claw.getBoundingClientRect();
        const playAreaRect = playArea.getBoundingClientRect();
        textEl.style.left = `${clawRect.left - playAreaRect.left}px`;
        textEl.style.top = `${clawRect.top - playAreaRect.top - 40}px`;
        playArea.appendChild(textEl);
        
        setTimeout(() => { textEl.remove(); }, 1500);
    }

    function updateInstruction() { switch(gameState) { case 'ready': case 'aiming': instructionText.textContent = '按住拖动瞄准，松手下落'; break; case 'retracting': case 'caught': if (fuel > 0) { instructionText.textContent = '按住消耗燃料来加速！'; } else { instructionText.textContent = '寻找能量水晶补充燃料！'; } break; default: instructionText.textContent = ''; break; } }
    
    // --- 启动游戏 ---
    initGame();

}); // 这是 DOMContentLoaded 的结束括号
