FROM node:20.17.0-alpine3.20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
CMD [ "app.js" ]
