FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to optimize Docker cache
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the project files
COPY . .

# Expose API port (3000) and TCP port for GalileoSky (5000)
EXPOSE 3000
EXPOSE 5000

# Start command
CMD ["node", "index.js"]
