FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY .npmrc.docker .npmrc

RUN npm install

COPY . .

RUN rm -f .npmrc
RUN npm run build

EXPOSE 80

CMD [ "node", "dist/server.js" ]