#!/bin/bash
echo "=== ARIA Angular Frontend ==="
echo ""

if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed. Install Node 18+ first."
  exit 1
fi

if ! command -v ng &> /dev/null; then
  echo "Installing Angular CLI globally..."
  npm install -g @angular/cli
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "Starting Angular dev server at http://localhost:4200"
echo "Make sure FastAPI backend is running at http://localhost:8000"
echo ""
ng serve --open
