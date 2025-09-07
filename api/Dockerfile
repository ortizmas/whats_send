# Usar Node 18
FROM node:18

# Diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --include=optional sharp && npm rebuild sharp --force

# Copiar código fonte
COPY . .

# Build TypeScript (opcional)
# RUN npm run build

# Expor porta
EXPOSE 3000

# Comando para rodar em desenvolvimento
CMD ["npm", "run", "dev"]
