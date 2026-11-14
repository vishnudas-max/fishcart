FROM node:24-alpine

WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci
COPY --chown=node:node . .

ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=${BACKEND_URL} NODE_ENV=production
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
