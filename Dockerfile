# Используем официальный образ Node.js
FROM node:18

# Рабочая директория в контейнере
WORKDIR /app

# Копируем package.json и package-lock.json (или yarn.lock) в контейнер
COPY package*.json ./

# Устанавливаем зависимости локально
RUN npm install

# Копируем весь проект в контейнер
COPY . .

# Собираем проект
RUN npm run build

# Команда по умолчанию
CMD ["sh"]
