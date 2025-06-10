# Use the official Node.js image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) to the container
COPY package*.json ./

# Install dependencies locally
RUN npm install

# Copy the entire project into the container
COPY . .

# Build the project
RUN npm run build

# Default command (opens a shell)
CMD ["sh"]
