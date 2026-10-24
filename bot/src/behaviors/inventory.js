// Импортированные ф-ции:
const { goals, Movements } = require('mineflayer-pathfinder');

// Ф-ции:
async function giveItem(bot, targetPlayerName, itemTarget, count = 1) {
    const player = bot.players[targetPlayerName]?.entity;
    
    if (!player) {
        bot.chat(`Я не вижу тебя поблизости!`);
        return;
    }

    // --- НОВАЯ ПРОВЕРКА ДИСТАНЦИИ (в 3D-пространстве) ---
    const distance = bot.entity.position.distanceTo(player.position);
    console.log(`[Дистанция] До игрока ${targetPlayerName}: ${distance.toFixed(2)} блоков`);
    
    if (distance > 30) {
        bot.chat("Не могу найти путь к тебе :("); // Выдаем сообщение, если игрок слишком далеко
        return;
    }

    // --- БЛОК НАВИГАЦИИ ---
    // Настраиваем физику движений (может ли бот прыгать, строить мосты и т.д.)
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    
    // Задаем цель: подойти к игроку на расстояние 2 блоков
    const goal = new goals.GoalNear(player.position.x, player.position.y, player.position.z, 2);
    bot.chat("Бегу к тебе!");
    
    try {
        await bot.pathfinder.goto(goal);
    } catch (err) {
        bot.chat("Застрял, не могу к тебе подойти :(");
        return;
    }
    

    await bot.lookAt(player.position.offset(0, player.height, 0));

    const searchTarget = itemTarget ? itemTarget.toLowerCase() : '';
    
    // Используем filter вместо find, чтобы получить ВСЕ слоты с этим предметом
    const matchingItems = bot.inventory.items().filter(item => item.name.includes(searchTarget));

    if (matchingItems.length > 0) {
        let remainingToDrop = count; // Сколько еще осталось выкинуть
        let totalDropped = 0;        // Сколько уже выкинули

        for (const item of matchingItems) {
            // Если выкинули нужное количество — останавливаем цикл
            if (remainingToDrop <= 0) break;

            // Считаем, сколько можем выкинуть ИЗ ЭТОГО СЛОТА
            // (либо остаток запроса, либо всё содержимое слота, если остаток больше)
            const dropAmount = Math.min(remainingToDrop, item.count);
            
            try {
                await bot.toss(item.type, null, dropAmount);
                remainingToDrop -= dropAmount;
                totalDropped += dropAmount;
            } catch (err) {
                console.log("[Inventory Error]:", err.message);
            }
        }

        bot.chat(`Держи! Я скинул тебе ${totalDropped} шт.`);
    } else {
        bot.chat(`У меня сейчас нет ${itemTarget}.`);
    }
}

module.exports = { giveItem };