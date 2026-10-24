from pydantic import BaseModel
from typing import Dict, List, Optional

# Входящие данные от бота (Node.js -> Python)
class AgentState(BaseModel):
    player_message: str
    player_name: str
    health: int
    inventory: Dict[str, int]
    nearest_entities: List[str]
    position: Dict[str, float]
    chat_history: str = ""

# Исходящее решение агента (Python -> Node.js)
class AgentAction(BaseModel):
    intent: str
    target: Optional[str] = None
    count: int    # Строго обязательное поле (без = 1)
    message: str