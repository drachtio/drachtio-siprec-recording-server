FROM node:18.16.0-alpine3.18
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
CMD [ "app.js" ]
