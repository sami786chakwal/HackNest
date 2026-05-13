FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
