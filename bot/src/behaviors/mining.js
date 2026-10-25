// Плагины ----------------
const { goals, Movements } = require('mineflayer-pathfinder');

// Ф-ции -----------------
async function gatherItem(bot, targetName, count = 1) {
    bot.chat(`Начинаю добычу: ${targetName}. Нужно собрать: ${count === 999 ? 'максимум' : count} шт.`);
    
    let searchName = targetName.toLowerCase();
    if (searchName === 'wood') searchName = 'log'; 
    if (searchName === 'stone') searchName = 'stone';

    let collected = 0;
    
    // Настройка физики движений
    const defaultMove = new Movements(bot);
    defaultMove.allowParkour = true;  // Прыжки по диагонали
    defaultMove.maxDropDown = 3;      // Максимальная глубина для поиска
    defaultMove.canDig = true;        // Возможность ломать мешающие блоки на пути
    bot.pathfinder.setMovements(defaultMove);
    
    // Цикл добычи
    while (collected < count) {
        // Проверка на завершение задачи
        if (bot.currentIntent !== 'gather') {
            console.log('[Добыча] Задача отменена перед поиском нового блока.');
            return;
        };
        // Поиск блока на новой итерации
        const targetBlock = bot.findBlock({
            matching: (block) => block.name.includes(searchName),
            maxDistance: 24 // Максимальная дистанция поиска, значение по умолчанию - 24
        });
        
        if (!targetBlock) {
            bot.chat(`Я не могу найти ${targetName} поблизости.`);
            return;
        }

        // Проверка, может ли бот добыть блок
        let canHarvest = targetBlock.canHarvest(bot.heldItem ? bot.heldItem.type : null);

        // Поиск подходящего инструмента в инвентаре
        if (!canHarvest) {
            for (const item of bot.inventory.items()) {
                if (targetBlock.canHarvest(item.type)) {
                    canHarvest = true;
                    break;
                }
            }
        }

        // Отказ при отсутствии инструмента
        if (!canHarvest) {
            console.log(`[Добыча] Отмена: нет инструмента для ${targetBlock.name}`);
            bot.chat(`У меня нет подходящего инструмента, чтобы добыть ${targetBlock.name}!`);
            return;
        }


        // Поиск профильного инструмента по ключевым словам
        const isDirt = ['dirt', 'grass', 'sand', 'gravel'].some(k => targetBlock.name.includes(k));
        const isWood = ['wood', 'log', 'planks'].some(k => targetBlock.name.includes(k));
        const isRock = ['stone', 'ore', 'deepslate', 'netherrack', 'cobblestone'].some(k => targetBlock.name.includes(k));

        let bestTool = null;

        if (isDirt) bestTool = bot.inventory.items().find(i => i.name.includes('shovel'));
        else if (isWood) bestTool = bot.inventory.items().find(i => i.name.includes('axe'));
        else if (isRock) bestTool = bot.inventory.items().find(i => i.name.includes('pickaxe'));

        if (!bestTool) {
            bestTool = bot.inventory.items().find(item => 
                targetBlock.canHarvest(item.type) && !item.name.includes('sword')
            );
        }

        // Экипировка инструмента
        if (bestTool && (!bot.heldItem || bot.heldItem.type !== bestTool.type)) {
            try {
                await bot.equip(bestTool, 'hand');
                console.log(`[Добыча] Взял в руки инструмент: ${bestTool.name}`);
            } catch (err) {}
        }


        if (!targetBlock) {
            bot.chat(`Больше не вижу ${searchName} поблизости. Смог добыть только: ${collected} шт.`);
            return;
        }
        // Завершение добычи, при смене задачи
        if (bot.currentIntent !== 'gather') {
            console.log('[Добыча] Задача отменена перед началом раскопки.');
            return;
        }

        try {
            // Добыча блока
            await bot.collectBlock.collect(targetBlock);
            collected++;
            console.log(`[Добыча] Собрано: ${collected}/${count === 999 ? '∞' : count}`);
        } catch (err) {
            // Проверка на актуальность задания
            if (bot.currentIntent !== 'gather') {
                console.log('[Добыча] Полная отмена задачи.');
                return; 
            }
            // Прерывание в случае начала боя
            if (err.message === 'Task cancelled' || (bot.pvp && bot.pvp.target)) {
                
                // Ожидание окончания боя
                if (bot.pvp && bot.pvp.target) {
                    bot.chat("Отвлекся на монстра! Приостанавливаю работу...");
                    while (true) {
                        while (bot.pvp && bot.pvp.target) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // Время для захвата новой цели
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Проверяем на наличие врага
                        if (bot.pvp && bot.pvp.target) {
                            console.log("[Защита] Цепочка боев: обнаружена новая цель!");
                        } else {
                            break;
                        }
                    }

                    // Сообщение о окончании боя
                    bot.chat("Территория зачищена. Возвращаюсь к добыче!");
                    continue;
                } 
                // Ожидание окончания перекуса
                else if (bot.isEating) {
                    console.log("[Добыча] Ожидаю окончания перекуса...");
                    while (bot.isEating) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } else {
                    // Пауза для непредвиденных отмен
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                continue; 
            }
            
            // Проверка на ошибку
            console.error("[Mining Error]:", err.message);
            bot.chat(`Не могу добраться до блока. Останавливаюсь. Итого собрал: ${collected} шт.`);
            return;
        }
    }
    
    bot.chat(`Готово! Успешно собрал ${collected} шт. ${targetName}!`);
}

module.exports = { gatherItem };