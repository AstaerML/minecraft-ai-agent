# Импорт библиотек
import chromadb
import os
from chromadb.utils import embedding_functions
import time

# Создаем папку chroma_data прямо в директории brain для сохранения памяти на диск
chroma_client = chromadb.PersistentClient(path="./chroma_data")

# Загружаем мультиязычную модель для векторизации (скачается автоматически при первом запуске)
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL_NAME)

# Создаем или подключаемся к коллекции (таблице)
collection = chroma_client.get_or_create_collection(name="minecraft_memory", embedding_function=ef)

def save_memory(text: str):
    """Сохраняет факт в векторную базу"""
    doc_id = f"mem_{int(time.time() * 1000)}"
    collection.add(
        documents=[text],
        ids=[doc_id]
    )
    print(f"[Память] Сохранено: {text}")

# Проверка работоспособности:
# save_memory("Сундук с железом и алмазами находится на координатах X: 100, Y: 64, Z: 50.")

def search_memory(query: str, n_results: int = 2) -> str:
    """Ищет релевантные факты по запросу пользователя"""
    # Если база пустая, поиск выдаст ошибку, поэтому проверяем количество записей
    if collection.count() == 0:
        return ""
        
    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, collection.count())
    )
    
    documents = results.get("documents")
    if not documents or not documents[0]:
        return ""
        
    return " ".join(documents[0])

def clear_memory():
    """Полностью очищает векторную базу данных"""
    global collection
    try:
        chroma_client.delete_collection(name="minecraft_memory")
        collection = chroma_client.get_or_create_collection(name="minecraft_memory", embedding_function=ef)
        print("[Память] База данных успешно очищена.")
        return True
    except Exception as e:
        print(f"[Память Error]: {e}")
        return False

def delete_memory(query: str):
    """Находит самое похожее воспоминание и стирает его"""
    if collection.count() == 0:
        return
        
    results = collection.query(query_texts=[query], n_results=1)
    ids = results.get("ids")
    
    if ids and ids[0]:
        collection.delete(ids=ids[0])
        print(f"[Память] Удалено неактуальное воспоминание: {results['documents'][0]}")