# Base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose the port your app runs on
EXPOSE 4002

# Start command
CMD ["npm", "start"]
