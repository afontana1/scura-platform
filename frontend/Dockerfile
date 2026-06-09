FROM node:20-alpine
WORKDIR /app

# Use pinned frontend dependency versions from package.json and avoid relying on
# a machine-generated package-lock from another environment during Docker builds.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
