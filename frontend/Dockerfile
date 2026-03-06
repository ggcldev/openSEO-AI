FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

EXPOSE 3000

CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
