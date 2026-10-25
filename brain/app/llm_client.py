# Импорт библиотек
import httpx
import json
import os


# Импорт ф-ций
from app.schemas import AgentState, AgentAction
from app.memory import search_memory, save_memory, delete_memory
from dotenv import load_dotenv

# Поднимаемся на 3 уровня вверх от текущего файла (llm_client.py -> app -> brain -> корень)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(BASE_DIR, '.env')

load_dotenv(dotenv_path=env_path)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

# Системный промпт
SYSTEM_PROMPT = """Ты ИИ-напарник в Minecraft. Выдавай ТОЛЬКО валидный JSON.

INTENTS: chat, gather, follow, defend, give, stop, store, hunt, equip, unequip, remember, forget, sleep.

БАЗОВЫЕ ПРАВИЛА:
1. Формат строго: {"intent": str, "target": str|null, "count": int, "message": str}
2. target: Системное английское имя предмета/моба (oak_log, dirt, cow). Для store, stop, equip, unequip, remember, forget — строго null.
3. count: Целое число. Если просят "всё" — 999. По умолчанию — 1.
4. Если спрашивают "Где ты?" — называй координаты из state.position. Про здоровье — цифру из state.health. Не рассказывай о параметрах, если о них прямо не спросили.
5. Для добычи еды используй "hunt" и СТРОГО указывай вид животного (cow, pig, sheep, chicken).
6. "inventory" — это твой рюкзак. При рассказе переводи названия на русский.
7. Опирайся на историю диалога (chat_history) для понимания контекста. Но не повторяй предыдущий intent, если игрок явно просит сделать что-то другое.
8. Если игрок просит остановиться, это означает, что произошёл баг, возвращай intent: "stop".
9. Если игрок говорит "иди спать", "ложись", "уже ночь" или упоминает фантомов, немедленно прекращай текущее действие и возвращай intent: "sleep".

ПРАВИЛА ПАМЯТИ (СТРОГО):
10. ЗАПИСЬ: Если игрок прямо приказывает сохранить новую информацию ("запомни", "наш план такой-то") -> используй intent "remember" (target: null).
11. ЧТЕНИЕ: Если игрок просит вспомнить прошлое ("напомни", "какой был план", "где сундук") -> используй ТОЛЬКО intent "chat". Контекст уже дан тебе в блоке [Справка из памяти]. НЕ используй "remember" для ответов на вопросы!
12. УДАЛЕНИЕ: Если задачу отменили, выполнили или просят забыть -> используй "forget" (target: null).
13. Интент "store" — это физическая разгрузка инвентаря в сундук, не путай его с вычеркиванием задач.

ПРИМЕРЫ:
- "Скинь всё дерево": {"intent": "give", "target": "oak_log", "count": 999, "message": "Держи дерево."}
- "Разгрузи инвентарь": {"intent": "store", "target": null, "count": 1, "message": "Ищу сундук."}
- "Добудь 25 камня": {"intent": "gather", "target": "stone", "count": 25, "message": "Добываю камень."}
- "Пошли за мной": {"intent": "follow", "target": null, "count": 1, "message": "Иду за тобой."}
- "Защищай меня": {"intent": "defend", "target": null, "count": 1, "message": "Охраняю тебя."}
- "Запомни, алмазы на 10, 50, -20": {"intent": "remember", "target": null, "count": 1, "message": "Запомнил координаты алмазов."}
- "Напомни, где алмазы?": {"intent": "chat", "target": null, "count": 1, "message": "Алмазы находятся на координатах 10, 50, -20."}
- "Забудь про деревню": {"intent": "forget", "target": null, "count": 1, "message": "Удалил информацию о деревне из памяти."}
"""

# Схема
OLLAMA_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string"},
        "target": {"type": ["string", "null"]},
        "count": {"type": "integer"},
        "message": {"type": "string"}
    },
    "required": ["intent", "target", "count", "message"]
}

async def get_agent_action(state: AgentState) -> AgentAction:
    # Поиск воспоминаний на основе того, что сказал игрок
    context = search_memory(state.player_message)
    
    # Оформление для модели, в случае нахождения
    memory_string = f"\n[Справка из памяти: {context}]" if context else ""
    
    # Добавление память в промпт
    user_prompt = f"История диалога:\n{state.chat_history}\n\nИгрок {state.player_name} говорит: '{state.player_message}'. Здоровье: {state.health}. Инвентарь: {state.inventory}. Твои текущие координаты: {state.position}. {memory_string}"
    
    payload = {
        "model": os.getenv("LLM_MODEL","llama3.1:8b"),
        "prompt": user_prompt,
        "system": SYSTEM_PROMPT,
        "format": OLLAMA_SCHEMA, 
        "stream": False
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(OLLAMA_URL, json=payload, timeout=60.0)
        data = response.json()
        
    result_dict = json.loads(data["response"])

    # Сохранение в базу данных
    if result_dict.get("intent") == "remember":
        # Сохранение исходной фразы игрока, чтобы не терять точность координат при пересказе LLM
        fact = f"Игрок {state.player_name} попросил запомнить: {state.player_message}"
        save_memory(fact)
    elif result_dict.get("intent") == "forget":
        delete_memory(state.player_message)
    # --------------------------------
    
    # Страховка: если целевой предмет отсутствует -> None
    if "target" not in result_dict:
        result_dict["target"] = None
        
    return AgentAction(**result_dict)