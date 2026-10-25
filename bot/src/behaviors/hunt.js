async function huntAnimal(bot, animalName) {
    // Поиск животных в заданном радиусе
    const animals = Object.values(bot.entities)
        .filter(e => e.name === animalName && bot.entity.position.distanceTo(e.position) < 32) // Значение поиска по умолчанию - 32 блока
        .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
        .slice(0, 3); // Ограничение - 3 цели за один приказ

    if (animals.length === 0) {
        bot.chat(`Я осмотрелся, но ${animalName} поблизости нет.`);
        return;
    }

    console.log(`[Охота] Найдено ${animals.length} шт. ${animalName}`);

    // Предварительное вооружение
    const weapon = bot.inventory.items().find(item => item.name.includes('sword') || item.name.includes('_axe'));
    if (weapon) {
        try {
            await bot.equip(weapon, 'hand');
            console.log(`[Охота] Взял в руки: ${weapon.name}`);
        } catch (err) {
            console.log(`[Охота Error]: Не смог взять оружие - ${err.message}`);
        }
    }

    // Последовательная атака каждой цели
    for (const animal of animals) {
        // ПРЕРЫВАНИЕ: Если игрок дал другую команду
        if (bot.currentIntent !== 'hunt') {
            console.log('[Охота] Задача отменена.');
            bot.pvp.stop();
            return;
        }

        if (!animal.isValid) continue;

        bot.pvp.attack(animal);

        await new Promise(resolve => setTimeout(resolve, 100));

        while (bot.pvp.target && bot.pvp.target.id === animal.id) {
            if (bot.currentIntent !== 'hunt') {
                bot.pvp.stop();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        // Ожидание 1.5 секунды, чтобы предметы успели выпасть на землю и притянуться к боту
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (bot.currentIntent === 'hunt') {
        bot.chat("Охота завершена, весь лут собран!");
        bot.currentIntent = 'idle'; // Сбрасывание намерения после успешного выполнения
    }
}

module.exports = { huntAnimal };