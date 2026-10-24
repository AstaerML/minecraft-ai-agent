async function huntAnimal(bot, animalName) {
    // 1. Ищем всех животных нужного типа в радиусе 32 блоков
    const animals = Object.values(bot.entities)
        .filter(e => e.name === animalName && bot.entity.position.distanceTo(e.position) < 32) // Значение поиска по умолчанию - 32 блока
        .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
        .slice(0, 3); // Ограничиваемся 3 целями за один приказ

    if (animals.length === 0) {
        bot.chat(`Я осмотрелся, но ${animalName} поблизости нет.`);
        return;
    }

    console.log(`[Охота] Найдено ${animals.length} шт. ${animalName}`);

    // 2. Вооружаемся перед охотой
    const weapon = bot.inventory.items().find(item => item.name.includes('sword') || item.name.includes('axe'));
    if (weapon) {
        try {
            await bot.equip(weapon, 'hand');
            console.log(`[Охота] Взял в руки: ${weapon.name}`);
        } catch (err) {
            console.log(`[Охота Error]: Не смог взять оружие - ${err.message}`);
        }
    }

    // 3. Последовательно атакуем каждую цель
    for (const animal of animals) {
        // ПРЕРЫВАНИЕ: Если игрок дал другую команду (например, "Стой") — отменяем охоту
        if (bot.currentIntent !== 'hunt') {
            console.log('[Охота] Задача отменена.');
            bot.pvp.stop();
            return;
        }

        if (!animal.isValid) continue;

        bot.pvp.attack(animal);

        // ИСПРАВЛЕНИЕ 1: Даем плагину pvp долю секунды на инициализацию внутреннего состояния
        await new Promise(resolve => setTimeout(resolve, 100));

        // ИСПРАВЛЕНИЕ 2: Проверяем, что цель существует, и сравниваем по ID, а не по ссылке на объект
        while (bot.pvp.target && bot.pvp.target.id === animal.id) {
            // Если во время боя поступил новый приказ
            if (bot.currentIntent !== 'hunt') {
                bot.pvp.stop();
                return;
            }
            // Снизил задержку до 250мс для более быстрого перехода к следующей цели после убийства
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        // 4. Ждем 1.5 секунды, чтобы предметы успели выпасть на землю и притянуться к боту
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (bot.currentIntent === 'hunt') {
        bot.chat("Охота завершена, весь лут собран!");
        bot.currentIntent = 'idle'; // Сбрасываем намерение после успешного выполнения
    }
}

module.exports = { huntAnimal };