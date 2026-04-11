#!/usr/bin/env bash
# AION Control Tower — One-command setup (Linux/macOS/WSL)
set -e

echo "═══════════════════════════════════════════════"
echo " AION Enterprise AI Control Tower — Setup"
echo "═══════════════════════════════════════════════"

# 1. Node.js deps
echo ""
echo "[1/4] Installing Node.js dependencies..."
npm install

# 2. Python venvs
echo ""
echo "[2/4] Setting up Python virtual environments..."

for SVC in anomaly_service forecasting_service maintenance_service; do
  DIR="services/ai-services/$SVC"
  echo "  → $SVC"
  python3 -m venv "$DIR/venv"
  source "$DIR/venv/bin/activate"
  pip install -q -r "$DIR/requirements.txt"
  deactivate
done

# 3. .env
if [ ! -f .env ]; then
  echo ""
  echo "[3/4] Creating .env from example..."
  cp .env.example .env
else
  echo "[3/4] .env already exists — skipping"
fi

echo ""
echo "[4/4] Setup complete!"
echo ""
echo "To start all services:"
echo ""
echo "  # Terminal 1 — Anomaly Service"
echo "  cd services/ai-services/anomaly_service && source venv/bin/activate && python main.py"
echo ""
echo "  # Terminal 2 — Forecasting Service"
echo "  cd services/ai-services/forecasting_service && source venv/bin/activate && python main.py"
echo ""
echo "  # Terminal 3 — Maintenance Service"
echo "  cd services/ai-services/maintenance_service && source venv/bin/activate && python main.py"
echo ""
echo "  # Terminal 4 — Gateway"
echo "  npm start"
echo ""
echo "  # Terminal 5 — Demo"
echo "  node scripts/demo.js"
