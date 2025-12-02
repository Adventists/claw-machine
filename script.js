// 使用 DOMContentLoaded 确保所有HTML元素加载完毕再执行JS
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const gameContainer = document.getElementById('game-container');
    const playArea = document.getElementById('play-area');
    const clawAssembly = document.getElementById('claw-assembly');
    const claw = document.getElementById('claw');
    const buffContainer = document.getElementById('buff-container'); // 虽然html里可能叫buff-container，但我们现在逻辑上叫crystals
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
    let dolls, crystals, caughtDoll;
    let isAiming, isBoosting, isFrenzyMode; // 新增 isFrenzyMode
    let caughtDollsHistory;
    let timerInterval;
    let frenzyTimeout; // 用于清除狂热模式的定时器

    // --- 游戏参数配置 (在这里调整游戏手感和难度) ---
    const INITIAL_TIME = 30;                 // 初始游戏时间（秒）
    const WIN_SCORE = 100;                 // 胜利所需达到的最低分数
    const CLAW_SPEED_DROP = 15;                // 抓钩下落速度 (数值越大越快)
    const CLAW_SPEED_RETRACT_EMPTY = 8;    // 空抓钩回收速度 (数值越大越快)
    const CLAW_SPEED_RETRACT_BASE = 4;     // 抓到物体后的基础回收速度 (会被重量影响)
    const FUEL_FROM_BUFF = 100;            // 每个Buff提供的燃料值 (直接充满)
    const FUEL_CONSUME_RATE = 40;          // 按住加速时，每秒消耗的燃料
    const BOOST_SPEED_MULTIPLIER = 2.5;    // 固定加速倍率
    const FRENZY_SPEED_MULTIPLIER = 2.0;   // 狂热模式速度倍率
    
    // --- 蛋种配置 ---
    const DOLL_TYPES = {
        green:   { weight: 1.0, value: 80, className: 'green', size: 0.9, probability: 0.3 },
        purple:  { weight: 1.8, value: 200, className: 'purple', size: 1.2, probability: 0.2 },
        heavy:   { weight: 3.0, value: 500, className: 'heavy', size: 1.4, probability: 0.15 },
        gold:    { 
            weight: 1.5, 
            value: 500, 
            className: 'gold', 
            size: 1.1, 
            probability: 0.1,
            onCatch: () => { triggerCoinRain(); return "金币雨! +$500"; }
        },
        mystery: { 
            weight: 1.5, 
            value: 0, // 动态
            className: 'mystery', 
            size: 1.2, 
            probability: 0.15,
            onCatch: (dollInstance) => {
                const val = Math.floor(Math.random() * 999) + 1;
                dollInstance.value = val;
                return `运气爆发! +$${val}`;
            }
        },
        rainbow: { 
            weight: 1.0, 
            value: 150, 
            className: 'rainbow', 
            size: 1.0, 
            probability: 0.1,
            onCatch: () => { activateFrenzyMode(); return "狂热模式! 10秒无敌"; }
        }
    };

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
    function dropClaw() { gameState = 'dropping'; }

    function initGame() {
        gameState = 'ready';
        score = 0; lives = 3; timeLeft = INITIAL_TIME; fuel = 0;
        dolls = []; crystals = []; caughtDoll = null;
        isAiming = false; isBoosting = false; isFrenzyMode = false;
        caughtDollsHistory = [];
        clearTimeout(frenzyTimeout);
        gameContainer.classList.remove('frenzy-mode-active');

        updateBoostBar();
        scoreTargetDisplay.textContent = `/ $${WIN_SCORE}`;
        updateUI();
        updateInstruction();
        messageOverlay.classList.add('hidden');
        winOverlay.classList.add('hidden');

        playArea.querySelectorAll('.doll, .effect-text, .crystal, .buff, .coin').forEach(el => el.remove());
        clearInterval(timerInterval);

        createDolls();
        createCrystal('fuel');
        createCrystal('danger');

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
                if (isFrenzyMode) speed *= FRENZY_SPEED_MULTIPLIER;
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
                if (caughtDoll) handleCaughtDoll();
                gameState = 'ready';
                claw.classList.remove('grabbing');
                updateUI();
            }
        }
    }

    function handleCaughtDoll() {
        const dollTypeConfig = Object.values(DOLL_TYPES).find(t => caughtDoll.element.classList.contains(t.className));
        let effectText = `+$${caughtDoll.value}`;
        
        // 处理特殊回调
        if (dollTypeConfig && dollTypeConfig.onCatch) {
            const customText = dollTypeConfig.onCatch(caughtDoll);
            if (customText) effectText = customText;
        }

        caughtDollsHistory.push({ ...caughtDoll, class: caughtDoll.element.className.replace('doll', '').trim() });
        score += caughtDoll.value;
        createCrystal();
        dolls = dolls.filter(d => d.element !== caughtDoll.element);
        caughtDoll.element.remove();
        caughtDoll = null;
        
        showEffectText(effectText);
    }

    function checkCollisions() {
        const clawRect = claw.getBoundingClientRect();
        
        // 与水晶碰撞
        for (let i = crystals.length - 1; i >= 0; i--) {
            const crystal = crystals[i];
            if (crystal.isDestroyed) continue;
            const crystalRect = crystal.element.getBoundingClientRect();
            
            if (isColliding(clawRect, crystalRect)) {
                // 无论哪种类型，碰到都会销毁
                crystal.isDestroyed = true;
                crystal.element.remove();
                crystals.splice(i, 1);

                // 判断水晶类型
                if (crystal.type === 'fuel') {
                    fuel = FUEL_FROM_BUFF;
                    updateBoostBar();
                    showEffectText('燃料补充!');
                } else if (crystal.type === 'danger') {
                    if (isFrenzyMode) {
                        showEffectText('无敌粉碎!');
                    } else {
                        loseLife();
                        return; // 立即返回，因为可能已经触发了惩罚
                    }
                }
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
    
    function dropCaughtDoll() {
        if (!caughtDoll) return;
        claw.classList.remove('grabbing');
        caughtDoll.isCaught = false;
        
        // 恢复到原始位置
        caughtDoll.element.style.left = caughtDoll.originalLeft;
        caughtDoll.element.style.bottom = caughtDoll.originalBottom;
        caughtDoll.element.style.top = ''; // 清除抓取时设置的top

        caughtDoll = null;
        // 这里不再调用 showEffectText，由外部控制
    }

    function loseLife() {
        lives--;
        updateUI();
        
        // 屏幕闪烁效果 - 应用到 playArea 而不是整个 gameContainer
        playArea.classList.add('flash-effect');
        setTimeout(() => {
            playArea.classList.remove('flash-effect');
        }, 500);

        if (caughtDoll) {
            dropCaughtDoll();
            showEffectText('哎呀！掉了！', 1); // index 1, 显示在下方
        }

        if (lives <= 0) {
            gameOver('生命耗尽!');
        } else {
            showEffectText('生命 -1', 0); // index 0
        }
    }
    
    function grabDoll(doll) {
        gameState = 'caught';
        caughtDoll = doll;
        doll.isCaught = true;
        claw.classList.add('grabbing');

        // 记录原始位置
        doll.originalLeft = doll.element.style.left;
        doll.originalBottom = doll.element.style.bottom || '20px'; // 如果CSS没设bottom，默认20px

        const clawRect = claw.getBoundingClientRect();
        const playAreaRect = playArea.getBoundingClientRect();
        doll.element.style.left = `${clawRect.left - playAreaRect.left + (clawRect.width - doll.element.offsetWidth) / 2}px`;
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
    function createDolls() {
        const types = Object.keys(DOLL_TYPES);
        // 根据概率生成
        let selectedTypes = [];
        for (let i = 0; i < 5; i++) {
            const rand = Math.random();
            let cumulativeProb = 0;
            let selected = null;
            for (const typeKey of types) {
                cumulativeProb += DOLL_TYPES[typeKey].probability;
                if (rand < cumulativeProb) {
                    selected = DOLL_TYPES[typeKey];
                    break;
                }
            }
            if (!selected) selected = DOLL_TYPES.green; // fallback
            selectedTypes.push(selected);
        }

        selectedTypes.forEach((type, index) => {
            const dollEl = document.createElement('div');
            dollEl.classList.add('doll', type.className);
            const baseWidth = 50, baseHeight = 70;
            dollEl.style.width = `${baseWidth * type.size}px`;
            dollEl.style.height = `${baseHeight * type.size}px`;
            const xPos = 20 + index * (PLAY_AREA_WIDTH / (selectedTypes.length - 0.5));
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

    function triggerCoinRain() {
        for (let i = 0; i < 30; i++) {
            const coin = document.createElement('div');
            coin.className = 'coin';
            coin.style.left = Math.random() * 90 + 5 + '%'; // 避免太靠边
            coin.style.animationDuration = (1 + Math.random() * 2) + 's';
            playArea.appendChild(coin); // 确保加到 playArea 里，且 playArea overflow:hidden 会截断多余部分
            setTimeout(() => coin.remove(), 3000);
        }
    }

    function activateFrenzyMode() {
        isFrenzyMode = true;
        gameContainer.classList.add('frenzy-mode-active');
        showEffectText("狂热模式开启!", 1);
        
        clearTimeout(frenzyTimeout);
        frenzyTimeout = setTimeout(() => {
            isFrenzyMode = false;
            gameContainer.classList.remove('frenzy-mode-active');
            showEffectText("狂热模式结束", 1);
        }, 10000);
    }

    function createCrystal(forceType = null) { 
        const crystalEl = document.createElement('div'); 
        let type;
        if (forceType) {
            type = forceType;
        } else {
            type = Math.random() < 0.3 ? 'danger' : 'fuel'; // 30% 概率是危险水晶
        }
        crystalEl.classList.add('crystal', type); 
        
        const randomTop = 100 + Math.random() * (PLAY_AREA_HEIGHT - 300); 
        crystalEl.style.top = `${randomTop}px`; 
        
        const animationDuration = (6 + Math.random() * 4) + 's'; 
        const animationName = Math.random() < 0.5 ? 'moveLeftToRight' : 'moveRightToLeft'; 
        crystalEl.style.animation = `${animationName} ${animationDuration} linear infinite alternate, buff-pulse 1.5s infinite`; 
        
        playArea.appendChild(crystalEl); 
        crystals.push({ element: crystalEl, type: type, isDestroyed: false }); 
    }
    function isColliding(rect1, rect2) { return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom); }
    function showEffectText(text, offsetIndex = 0) { 
        const textEl = document.createElement('div'); 
        textEl.className = 'effect-text'; 
        textEl.textContent = text; 
        
        const clawRect = claw.getBoundingClientRect(); 
        const containerRect = gameContainer.getBoundingClientRect(); // 使用 gameContainer 作为参考系
        
        // 计算相对于 gameContainer 的位置
        const left = clawRect.left - containerRect.left;
        const top = clawRect.top - containerRect.top - 40 + (offsetIndex * 30); // 每个 offset 增加 30px 垂直距离
        
        textEl.style.left = `${left}px`; 
        textEl.style.top = `${top}px`; 
        
        gameContainer.appendChild(textEl); // append 到 gameContainer 避免被 play-area 裁剪
        setTimeout(() => { textEl.remove(); }, 1500); 
    }
    function updateInstruction() { switch(gameState) { case 'ready': case 'aiming': instructionText.textContent = '按住拖动瞄准，松手下落'; break; case 'retracting': case 'caught': if (fuel > 0) { instructionText.textContent = '按住消耗燃料来加速！'; } else { instructionText.textContent = '寻找能量水晶补充燃料！'; } break; default: instructionText.textContent = ''; break; } }
    
    // --- 启动游戏 ---
    initGame();

}); // 这是 DOMContentLoaded 的结束括号
