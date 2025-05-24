# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
# It's crucial that package-lock.json exists and is committed to your repository
COPY package.json ./
COPY package-lock.json ./

# Install app dependencies using npm ci for cleaner installs
# npm ci requires a package-lock.json or npm-shrinkwrap.json
# It will be faster and more reliable for builds
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE ${PORT:-3000}

# Define the command to run the app
CMD [ "node", "src/server.js" ]
