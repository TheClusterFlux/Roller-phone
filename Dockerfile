FROM node:20-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-l", "8080"]
