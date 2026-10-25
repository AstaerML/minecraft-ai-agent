// Плагины
const { goals, Movements } = require('mineflayer-pathfinder');

async function followPlayer(bot, targetPlayerName) {
    const target = bot.players[targetPlayerName]?.entity;

    if (!target) {
        bot.chat(`Я не вижу тебя поблизости, ${targetPlayerName}! Подойди поближе, чтобы я тебя заметил.`);
        return;
    }

    // Настройка физики (разрешаем прыгать, избегать лавы и т.д.)
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);

    bot.followingTarget = target; // Сохранение в глобальную память

    // Создание цели: следовать за объектом target, держа дистанцию в 2 блока
    const goal = new goals.GoalFollow(target, 2);

    bot.chat(`Понял, иду за тобой, ${targetPlayerName}!`);

    bot.pathfinder.setGoal(goal, true);
}

module.exports = { followPlayer };