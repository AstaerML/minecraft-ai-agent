// Импортируемые ф-ции ----------------------
const { getAgentState } = require('./state.js');
const { gatherItem } = require('./behaviors/mining');
const { giveItem } = require('./behaviors/inventory');
const { askBrain } = require('./brainBridge');
const { followPlayer } = require('./behaviors/follow');
const { storeItems } = require('./behaviors/storage');
const { huntAnimal } = require('./behaviors/hunt.js');

// Константы ---------------------------
const chatHistory = [];
const MAX_HISTORY = 6; // Храним последние 6 реплик (3 от игрока, 3 от бота)
const path = require('path');
// Поднимаемся на два уровня вверх: из bot/src в корень проекта
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Константы-плагины ------------------------------
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mineflayer = require('mineflayer');
const pvp = require('mineflayer-pvp').plugin;
const toolPlugin = require('mineflayer-tool').plugin || require('mineflayer-tool');
const collectBlock = require('mineflayer-collectblock').plugin || require('mineflayer-collectblock');


// Настройки подключения (Minecraft сервер должен быть запущен)
const bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'host.docker.internal',
    port: process.env.MC_PORT ? parseInt(process.env.MC_PORT) : 25565,
    username: process.env.BOT_USERNAME || 'AI_Agent',
    version: '1.20.4'  // Версия сервера PaperMC
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(toolPlugin);
bot.loadPlugin(collectBlock);

bot.on('spawn', () => {
    console.log('✅ Бот успешно появился в мире!');
});

// --- РЕАКТИВНЫЙ УРОВЕНЬ: Умная самозащита с переключением оружия ---
bot.on('physicsTick', async () => {
    if (!bot.pvp || bot.pvp.target) return;
    if (bot.currentIntent === 'follow') return;
    
    // ПРЕДОХРАНИТЕЛЬ: Не ищем новых врагов, пока бот копается в инвентаре
    if (bot.isEquipping) return; 

    const enemy = bot.nearestEntity(entity => {
        const hostileMobs = ['zombie', 'skeleton', 'creeper', 'spider', 'husk', 'drowned', 'skeleton_horse', 'zombie_horse', 'piglin', 'hoglin'];
        const isHostile = hostileMobs.includes(entity.name) || entity.kind === 'Hostile mobs';
        if (!isHostile) return false;

        const radius = bot.currentIntent === 'defend' ? 12 : 6;
        let distToBot = bot.entity.position.distanceTo(entity.position);
        
        if (bot.currentIntent === 'defend' && bot.targetPlayer) {
            const player = bot.players[bot.targetPlayer]?.entity;
            if (player) {
                return player.position.distanceTo(entity.position) < radius || distToBot < radius;
            }
        }
        return distToBot < radius;
    });

    if (enemy && !bot.isEating) { // Не начинаем драться, пока жуем яблоко!
    
        // Если бот в этот момент копал землю - отменяем!
        if (bot.collectBlock?.targets?.length > 0) {
            bot.collectBlock.cancelTask();
            console.log('[Защита] Добыча прервана ради боя!');
        }

        if (!bot.pvp.target) {
            // Экипируем меч
            const bestWeapon = bot.inventory.items().find(item => item.name.includes('sword') || item.name.includes('axe'));
            if (bestWeapon) {
                bot.equip(bestWeapon, 'hand').catch(console.error);
                console.log(`[Защита] Достаю оружие: ${bestWeapon.name}`);
            }
        
            bot.pvp.attack(enemy);
        }
    }
    
});

bot.on('stoppedAttacking', async () => {
    console.log('[Защита] Враг повержен или потерян.');

    // -------------------------------------------
    
    if (bot.currentIntent === 'defend' && bot.targetPlayer) {
        bot.chat("Угроза устранена! Возвращаюсь к охране.");
        const { followPlayer } = require('./behaviors/follow');
        await followPlayer(bot, bot.targetPlayer);
    } else if (bot.currentIntent !== 'gather') {
        bot.chat("Враг повержен! Я готов к командам.");
    }
});

// ----------------------------------------------------

// --- РЕАКТИВНЫЙ УРОВЕНЬ: Нативная система питания ---
let lastHungerAlert = 0; // Таймер, чтобы бот не спамил в чат каждую секунду
bot.isEating = false;

bot.on('health', async () => {
    if (bot.isEating) return; // Если уже едим - не спамим

    // Критическое условие: здоровье меньше 12 (6 сердец) ИЛИ голод меньше 16
    const needsFood = bot.health < 12 || bot.food < 16;
    
    if (needsFood) {
        const food = bot.inventory.items().find(item => 
            ['enchanted_golden_apple', 'golden_apple', 'cooked_beef', 'cooked_porkchop', 'bread'].includes(item.name)
        );

        if (food) {
            bot.isEating = true;
            
            // 1. ЖЕСТКО ОСТАНАВЛИВАЕМ ВСЕ ДРУГИЕ ПРОЦЕССЫ
            if (bot.pvp.target) bot.pvp.stop(); // Прерываем бой
            if (bot.collectBlock?.targets?.length > 0) bot.collectBlock.cancelTask(); // Прерываем копку
            bot.pathfinder.setGoal(null); // Останавливаем бег

            console.log(`[Питание] Срочный перекус! Здоровье: ${Math.round(bot.health)}. Ем: ${food.name}`);
            
            try {
                await bot.equip(food, 'hand');
                await bot.consume(); 
                console.log(`[Питание] Успешно перекусил! Здоровье: ${Math.round(bot.health)}`);
            } catch (err) {
                console.log(`[Питание Error]: ${err.message}`);
            }

            bot.isEating = false;

            // --- ВОССТАНОВЛЕНИЕ ДИНАМИЧЕСКИХ ЗАДАЧ ---
            // Проверяем, что намерение не изменилось (игрок не крикнул "Стой!" во время еды)
            if ((bot.currentIntent === 'follow' || bot.currentIntent === 'defend') && bot.followingTarget) {
                const goals = require('mineflayer-pathfinder').goals;
                bot.pathfinder.setGoal(new goals.GoalFollow(bot.followingTarget, 2), true);
                console.log(`[Питание] Возвращаюсь к динамической задаче: ${bot.currentIntent}`);
            }
        } else {
            // 2. ЕДЫ НЕТ - ЖАЛУЕМСЯ ИГРОКУ (максимум раз в 30 секунд)
            if (Date.now() - lastHungerAlert > 30000) {
                bot.chat("У меня кончилась еда, и я очень голоден! Скинь мне что-нибудь поесть или прикажи поохотиться.");
                console.log(`[Питание] Внимание: критический уровень голода, а еды в инвентаре нет!`);
                lastHungerAlert = Date.now();
            }
        }
    }
});

// -----------------------------------------------------------

// --- РЕАКТИВНЫЙ УРОВЕНЬ: Умная броня ---
bot.autoArmorEnabled = true; // Флаг, чтобы бот не надевал броню, если мы приказали её снять

function getArmorScore(name) {
    if (!name) return 0;
    if (name.includes('netherite')) return 6;
    if (name.includes('diamond')) return 5;
    if (name.includes('iron')) return 4;
    if (name.includes('chainmail')) return 3;
    if (name.includes('golden')) return 2;
    if (name.includes('leather')) return 1;
    return 0;
}

async function equipBestArmor() {
    if (!bot.autoArmorEnabled || bot.isEquipping) return;
    
    const armorTypes = {
        'helmet': { slot: 'head', equipIndex: 5 },
        'chestplate': { slot: 'torso', equipIndex: 4 },
        'leggings': { slot: 'legs', equipIndex: 3 },
        'boots': { slot: 'feet', equipIndex: 2 }
    };

    for (const [piece, data] of Object.entries(armorTypes)) {
        // Ищем все предметы этого типа брони в инвентаре
        const available = bot.inventory.items().filter(i => i.name.includes(piece));
        if (available.length === 0) continue;

        // Сортируем от лучшего к худшему
        available.sort((a, b) => getArmorScore(b.name) - getArmorScore(a.name));
        const best = available[0];
        
        // Смотрим, что надето на боте прямо сейчас
        const currentEquipped = bot.entity.equipment[data.equipIndex];
        const currentScore = currentEquipped ? getArmorScore(currentEquipped.name) : 0;
        const bestScore = getArmorScore(best.name);

        // Если в рюкзаке лежит что-то круче, чем надето на теле — переодеваемся!
        if (bestScore > currentScore) {
            bot.isEquipping = true;
            try {
                await bot.equip(best, data.slot);
                console.log(`[Броня] Автоматически надел лучший предмет: ${best.name}`);
            } catch (err) {}
            bot.isEquipping = false;
        }
    }
}

// Проверяем броню каждые 3 секунды (не нагружает сервер)
setInterval(equipBestArmor, 3000);

// -----------------------------------------------------------

// Полная остановка всех действий
function stopAllActivities(bot) {
    console.log(`>>> Экстренная остановка и сброс состояния`);
    bot.pathfinder.setGoal(null);
    
    if (bot.collectBlock?.targets?.length > 0) {
        bot.collectBlock.cancelTask();
    }
    
    bot.clearControlStates();
    
    bot.setControlState('jump', true);
    setTimeout(() => {
        bot.setControlState('jump', false);
    }, 250);
}
// -----------------------------------------------------------

// Функция сна
async function goToSleep(bot) {
    const bed = bot.findBlock({
        matching: block => block.name.endsWith('_bed'),
        maxDistance: 32 // Дистанция обнаружения кровати. По умолчанию - 32 блока
    });

    if (!bed) {
        bot.chat("Я не вижу поблизости ни одной кровати!");
        return;
    }

    try {
        // Используем goals.GoalNear из вашего импорта
        await bot.pathfinder.goto(new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 1));
        await bot.sleep(bed);
        bot.chat("Спокойной ночи! zZz");
    } catch (err) {
        bot.chat(`Не могу уснуть: ${err.message}`); 
    }
}

// -----------------------------------------------------------

// Слушаем сообщения в чате
bot.on('chat', async (username, message) => {
    // Игнорируем собственные сообщения бота, чтобы избежать зацикливания
    if (username === bot.username) return;

    console.log(`[Чат] ${username}: ${message}`);

    // 1. Сохраняем реплику игрока
    chatHistory.push(`Игрок ${username}: ${message}`);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

    // Динамическое состояние
    const state = getAgentState(bot, username, message, chatHistory.join('\n'));

    // Отправляем запрос на Python-сервер
    console.log('⏳ Ожидаю решение от LLM...');
    const decision = await askBrain(state);

    if (decision) {
        console.log(`[Мозг] Принято решение:`, decision);
        
        // Предохранитель - если модель не подала количество
        const actionCount = decision.count || 1;

        // ЗАПОМИНАЕМ ТЕКУЩЕЕ СОСТОЯНИЕ БОТА
        bot.currentIntent = decision.intent; 
        bot.targetPlayer = username; 

        // 2. Тактический уровень: Маршрутизация намерений
        switch (decision.intent) {
            case 'give':
                console.log(`>>> Передача ${actionCount} шт. ${decision.target}`);
                await giveItem(bot, username, decision.target, actionCount);
                break;

            case 'gather':
                console.log(`>>> Добыча ${actionCount} шт. ${decision.target}`);
                await gatherItem(bot, decision.target, actionCount);
                break;

            case 'follow':
                console.log(`>>> Мирное следование за ${username}`);
                await followPlayer(bot, username);
                break;

            case 'defend':
                console.log(`>>> Режим охраны игрока ${username}`);
                await followPlayer(bot, username); // Используем ту же навигацию, разница будет в physicsTick
                break;

            case 'stop':
                stopAllActivities(bot);
                bot.chat(decision.message);
                break;

            case 'store':
                console.log(`>>> Разгрузка инвентаря в сундук`);
                await storeItems(bot);
                break;

            case 'equip':
                console.log(`>>> Экипировка лучшей брони`);
                bot.chat("Проверяю инвентарь и надеваю лучшую броню!");
                bot.autoArmorEnabled = true; // Включаем авто-рефлекс
                await equipBestArmor();      // Мгновенно вызываем нашу функцию
                break;

            case 'unequip':
                console.log(`>>> Снятие брони`);
                bot.chat("Снимаю броню и складываю в инвентарь.");
                bot.autoArmorEnabled = false; // ОТКЛЮЧАЕМ авто-броню!
                const slots = ['head', 'torso', 'legs', 'feet'];
                for (const slot of slots) {
                    try { await bot.unequip(slot); } catch (err) { }
                }
                break;

            case 'hunt':
                bot.chat(decision.message);
                chatHistory.push(`Бот: ${decision.message}`);
                if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                
                const targetAnimal = decision.target || 'cow';
                console.log(`>>> Охота на ${targetAnimal}`);
                await huntAnimal(bot, targetAnimal);
                break;

            case 'remember':
                console.log(`>>> Запись в память: ${decision.message}`);
                bot.chat(decision.message);
                chatHistory.push(`ИИ-агент: ${decision.message}`);
                if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                break;

            case 'forget':
                console.log(`>>> Стирание из памяти: ${decision.message}`);
                bot.chat(decision.message);
                chatHistory.push(`ИИ-агент: ${decision.message}`);
                if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                break;

            case 'sleep':
                stopAllActivities(bot);
                bot.chat(decision.message);
                goToSleep(bot);
                break;

            case 'chat':
                bot.chat(decision.message);
                chatHistory.push(`ИИ-агент: ${decision.message}`);
                if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
                break;
        }
    }
});

// Обработка ошибок подключения
bot.on('kicked', console.log);
bot.on('error', console.log);