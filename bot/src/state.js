function getAgentState(bot, username, message, chatHistoryString = "") {
    // Собираем реальный инвентарь (ключ - имя предмета, значение - количество)
    const inventory = {};
    bot.inventory.items().forEach(item => {
        if (inventory[item.name]) {
            inventory[item.name] += item.count;
        } else {
            inventory[item.name] = item.count;
        }
    });

    // Ищем ближайших сущностей (мобов/игроков) в радиусе 16 блоков
    const entities = Object.values(bot.entities)
        .filter(entity => entity.type === 'mob' || entity.type === 'player')
        .filter(entity => entity !== bot.entity) // Исключаем самого бота
        .filter(entity => bot.entity.position.distanceTo(entity.position) < 16)
        .map(entity => entity.name || entity.username);

    return {
        player_message: message,
        player_name: username,
        health: Math.round(bot.health),
        inventory: inventory,
        nearest_entities: entities,
        position: {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z)
        },
        chat_history: chatHistoryString
    };
}

module.exports = { getAgentState };