#!/bin/bash
# Start ARIA React frontend
cd "$(dirname "$0")/frontend"
echo "Installing npm packages..."
npm install
echo ""
echo "Starting ARIA React dashboard on http://localhost:3000"
npm start
