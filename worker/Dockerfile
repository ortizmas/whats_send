FROM node:20-alpine

# Diretório de trabalho
WORKDIR /app

# Instalar dependências do sistema necessárias para Chromium e Sharp
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  udev \
  tzdata \
  vips-dev \
  fftw-dev \
  build-base \
  python3 \
  git \
  --repository https://dl-cdn.alpinelinux.org/alpine/edge/testing/ \
  --repository https://dl-cdn.alpinelinux.org/alpine/edge/main/

# Copiar package.json e instalar dependências
COPY package*.json ./

# Instalar Sharp e recompilar para Alpine + ARM64
RUN npm install --include=optional sharp && npm rebuild sharp --force

# Evitar download do Chromium pelo Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copiar código fonte
COPY . .

# Expor porta
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["npm", "run", "dev"]
