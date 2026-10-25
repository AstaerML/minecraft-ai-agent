const { goals, Movements } = require('mineflayer-pathfinder');

async function storeItems(bot) {
    bot.chat("Ищу сундук поблизости...");

    // Поиск сундука в заданном радиусе
    const chestBlock = bot.findBlock({
        matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
        maxDistance: 32 // Максимальная дистанция для обнаружения сундука, значение по умолчанию - 32
    });

    if (!chestBlock) {
        bot.chat("Я не вижу сундуков поблизости!");
        return;
    }

    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    const goal = new goals.GoalGetToBlock(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z);

    try {
        await bot.pathfinder.goto(goal);
        bot.chat("Сундук найден! Начинаю разгрузку...");
        
        // Открытие сундука
        const chest = await bot.openContainer(chestBlock);
        let depositedCount = 0;

        // Перебор инвентаря бота
        for (const item of bot.inventory.items()) {
            // Предметы, которые бот не будет выкладывать (инструменты, еда)
            const isTool = item.name.includes('sword') || item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel');
            const isFood = item.name.includes('bread') || item.name.includes('beef') || item.name.includes('porkchop') || item.name.includes('apple');
            
            if (isTool || isFood) continue;

            // Выкладывание предметов
            try {
                await chest.deposit(item.type, null, item.count);
                depositedCount++;
            } catch (err) {
                console.log(`[Склад] Не смог положить ${item.name} (возможно, сундук полон).`);
            }
        }

        // Закрытие сундука
        await chest.close();
        
        if (depositedCount > 0) {
            bot.chat("Я успешно разгрузил ресурсы в сундук!");
        } else {
            bot.chat("Мне нечего выкладывать, или сундук забит до отказа.");
        }

    } catch (err) {
        console.error("[Storage Error]:", err.message);
        bot.chat("Не смог добраться до сундука или открыть его.");
    }
}

module.exports = { storeItems };