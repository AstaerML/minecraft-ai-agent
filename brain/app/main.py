# Библиотеки и ф-ции для сваггера
from fastapi import FastAPI
from app.schemas import AgentState, AgentAction
from app.llm_client import get_agent_action
from app.memory import clear_memory

app = FastAPI(title="Minecraft AI Brain")

@app.post("/decide", response_model=AgentAction)
async def decide_action(state: AgentState):
    """
    Эндпоинт принимает состояние от Mineflayer и возвращает решение LLM.
    """
    action = await get_agent_action(state)
    return action

@app.delete("/memory/clear")
async def reset_memory():
    success = clear_memory()
    if success:
        return {"status": "success", "message": "Векторная память агента полностью очищена"}
    return {"status": "error", "message": "Не удалось очистить память"}