const axios = require('axios');

const path = require('path');
// Поднимаемся на два уровня вверх: из bot/src в корень проекта
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// Адрес FastAPI сервера
const BRAIN_URL = process.env.BRAIN_URL || 'http://localhost:8000/decide';

async function askBrain(state) {
    try {
        const response = await axios.post(BRAIN_URL, state);
        return response.data; // Возвращает JSON с intent, target и message
    } catch (error) {
        console.error("❌ Ошибка связи с когнитивным сервером:", error.message);
        return null;
    }
}

module.exports = { askBrain };