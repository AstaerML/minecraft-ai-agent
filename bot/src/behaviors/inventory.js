// Импорт плагинов
const { goals, Movements } = require('mineflayer-pathfinder');

// Ф-ции:
async function giveItem(bot, targetPlayerName, itemTarget, count = 1) {
    const player = bot.players[targetPlayerName]?.entity;
    
    if (!player) {
        bot.chat(`Я не вижу тебя поблизости!`);
        return;
    }

    // Проверка дистанции до игрока
    const distance = bot.entity.position.distanceTo(player.position);
    console.log(`[Дистанция] До игрока ${targetPlayerName}: ${distance.toFixed(2)} блоков`);
    
    if (distance > 30) {
        bot.chat("Не могу найти путь к тебе :(");
        return;
    }

    // Настройка физики движения
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    
    // Инициализация цели: подойти к игроку на расстояние 2 блоков
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
    
    // Получение всех слотов с предметом
    const matchingItems = bot.inventory.items().filter(item => item.name.includes(searchTarget));

    if (matchingItems.length > 0) {
        let remainingToDrop = count; // Сколько еще осталось выкинуть
        let totalDropped = 0;        // Сколько уже выкинуто

        for (const item of matchingItems) {
            // Если выкинуто нужное количество — цикл останавливается
            if (remainingToDrop <= 0) break;

            // Расчёт количества требуемого/доступного для выбрасывания из 1-го слота
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