// Плагины ----------------
const { goals, Movements } = require('mineflayer-pathfinder');

// Ф-ции -----------------
async function gatherItem(bot, targetName, count = 1) {
    bot.chat(`Начинаю добычу: ${targetName}. Нужно собрать: ${count === 999 ? 'максимум' : count} шт.`);
    
    let searchName = targetName.toLowerCase();
    // Убираем жесткую привязку oak, чтобы бот мог копать birch_log, spruce_log и т.д.
    if (searchName === 'wood') searchName = 'log'; 
    if (searchName === 'stone') searchName = 'stone';

    let collected = 0;
    
    // ФИЗИКа ДВИЖЕНИЙ ДЛЯ АЛГОРИТМА ПОИСКА ПУТИ
    const defaultMove = new Movements(bot);
    defaultMove.allowParkour = true; // Запрещаем сложные прыжки по диагонали
    defaultMove.maxDropDown = 3;      // Запрещаем прыгать в глубокие шахты (максимум 3 блоков)
    defaultMove.canDig = true;        // Разрешаем ломать мешающие блоки на пути
    bot.pathfinder.setMovements(defaultMove);
    
    // Цикл добычи
    while (collected < count) {
        // ПРЕДОХРАНИТЕЛЬ 1: Выход, если задача изменилась между итерациями
        if (bot.currentIntent !== 'gather') {
            console.log('[Добыча] Задача отменена перед поиском нового блока.');
            return;
        };
        // Ищем новый блок на каждой итерации (т.к. предыдущий уже сломан)
        const targetBlock = bot.findBlock({
            matching: (block) => block.name.includes(searchName),
            maxDistance: 24
        });
        
        if (!targetBlock) {
            bot.chat(`Я не могу найти ${targetName} поблизости.`);
            return;
        }

        // --- ИСПРАВЛЕННЫЙ ПРЕДОХРАНИТЕЛЬ ОТ КРАША ПАМЯТИ ---
        // 1. Проверяем, может ли бот добыть блок тем, что сейчас в руках (или голой рукой, если передаем null)
        let canHarvest = targetBlock.canHarvest(bot.heldItem ? bot.heldItem.type : null);

        // 2. Если в руках не то, ищем подходящий инструмент в инвентаре
        if (!canHarvest) {
            for (const item of bot.inventory.items()) {
                if (targetBlock.canHarvest(item.type)) {
                    canHarvest = true;
                    break;
                }
            }
        }

        // 3. Если ни в руках, ни в инвентаре нет нужной кирки — отказываемся
        if (!canHarvest) {
            console.log(`[Добыча] Отмена: нет инструмента для ${targetBlock.name}`);
            bot.chat(`У меня нет подходящего инструмента, чтобы добыть ${targetBlock.name}!`);
            return; // Прерываем функцию до того, как pathfinder сойдет с ума
        }

        // ------------------------------------

        // Ищем профильный инструмент по ключевым словам
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

        // Если инструмент найден и он еще не в руках — экипируем его
        if (bestTool && (!bot.heldItem || bot.heldItem.type !== bestTool.type)) {
            try {
                await bot.equip(bestTool, 'hand');
                console.log(`[Добыча] Взял в руки инструмент: ${bestTool.name}`);
            } catch (err) {}
        }
            
        // ------------------------------------


        if (!targetBlock) {
            bot.chat(`Больше не вижу ${searchName} поблизости. Смог добыть только: ${collected} шт.`);
            return;
        }
        // ПРЕДОХРАНИТЕЛЬ 2: Выход, если задача изменилась во время смены инструмента
        if (bot.currentIntent !== 'gather') {
            console.log('[Добыча] Задача отменена перед началом раскопки.');
            return;
        }

        try {
            // Добываем блок
            await bot.collectBlock.collect(targetBlock);
            collected++;
            console.log(`[Добыча] Собрано: ${collected}/${count === 999 ? '∞' : count}`);
        } catch (err) {
            // Если игрок скомандовал "стой", "иди сюда" или дал другую задачу — навсегда выходим
            if (bot.currentIntent !== 'gather') {
                console.log('[Добыча] Полная отмена задачи.');
                return; 
            }
            // Если прерывание инициировано нами (бой, еда или ручная отмена)
            if (err.message === 'Task cancelled' || (bot.pvp && bot.pvp.target)) {
                
                // 1. Ожидание окончания боя
                if (bot.pvp && bot.pvp.target) {
                    bot.chat("Отвлекся на монстра! Приостанавливаю работу...");
                    while (true) {
                        // Спим, пока деремся с текущей целью
                        while (bot.pvp && bot.pvp.target) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // Враг мертв. Даем радару 1 секунду на захват следующего врага из толпы
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Проверяем, появился ли новый враг
                        if (bot.pvp && bot.pvp.target) {
                            console.log("[Защита] Цепочка боев: обнаружена новая цель!");
                            // Идем на новый круг while (true), чтобы добить новую цель
                        } else {
                            // За 1 секунду никого не нашли. Бой точно окончен!
                            break;
                        }
                    }

                    // Сообщаем в чат только один раз в самом конце
                    bot.chat("Территория зачищена. Возвращаюсь к добыче!");
                    continue;
                } 
                // 2. Ожидание окончания перекуса
                else if (bot.isEating) {
                    console.log("[Добыча] Ожидаю окончания перекуса...");
                    while (bot.isEating) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } else {
                    // Базовая пауза для непредвиденных отмен
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Инструкция continue запустит цикл заново
                continue; 
            }
            
            // Если это настоящая ошибка движка (невозможно проложить путь и т.д.)
            console.error("[Mining Error]:", err.message);
            bot.chat(`Не могу добраться до блока. Останавливаюсь. Итого собрал: ${collected} шт.`);
            return;
        }
    }
    
    bot.chat(`Готово! Успешно собрал ${collected} шт. ${targetName}!`);
}

module.exports = { gatherItem };