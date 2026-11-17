FROM node:24-alpine

WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci
COPY --chown=node:node . .

ARG BACKEND_URL=http://backend:8000
ARG NEXT_PUBLIC_STORE_PHONE=
ENV BACKEND_URL=$BACKEND_URL NEXT_PUBLIC_STORE_PHONE=$NEXT_PUBLIC_STORE_PHONE NODE_ENV=production
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
