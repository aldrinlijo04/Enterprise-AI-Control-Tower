#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.stack-runtime"
PID_DIR="$RUNTIME_DIR/pids"
LOG_DIR="$RUNTIME_DIR/logs"

SERVICES=(
  "main_backend"
  "main_frontend"
  "finpilot_backend"
  "finpilot_frontend"
)

mkdir -p "$PID_DIR" "$LOG_DIR"

usage() {
  cat <<'EOF'
Usage: ./run_all_services.sh [start|stop|restart|status|logs]

Commands:
  start     Start all 4 services in the background
  stop      Stop all services started by this script
  restart   Stop and start all services
  status    Show running status for all services
  logs      Tail logs for all services, or one service when provided
            Example: ./run_all_services.sh logs finpilot_frontend
EOF
}

service_url() {
  case "$1" in
    main_backend) echo "http://localhost:8000/docs" ;;
    main_frontend) echo "http://localhost:4200" ;;
    finpilot_backend) echo "http://localhost:8010/docs" ;;
    finpilot_frontend) echo "http://localhost:4300" ;;
    *) echo "" ;;
  esac
}

pid_file_for() {
  echo "$PID_DIR/$1.pid"
}

log_file_for() {
  echo "$LOG_DIR/$1.log"
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

service_is_running() {
  local service="$1"
  local pid_file
  local pid

  pid_file="$(pid_file_for "$service")"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  is_pid_running "$pid"
}

print_status_line() {
  local service="$1"
  local pid_file
  local log_file
  local url

  pid_file="$(pid_file_for "$service")"
  log_file="$(log_file_for "$service")"
  url="$(service_url "$service")"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && is_pid_running "$pid"; then
      echo "[running] $service (pid $pid)"
      echo "          URL: $url"
      echo "          LOG: $log_file"
      return
    fi
  fi

  echo "[stopped] $service"
  echo "          URL: $url"
  echo "          LOG: $log_file"
}

pick_python() {
  local candidate
  for candidate in "$@"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  return 1
}

ensure_main_backend_deps() {
  local python_bin="$1"
  if ! (cd "$ROOT_DIR/backend" && "$python_bin" -c "import fastapi, uvicorn" >/dev/null 2>&1); then
    echo "[setup] Installing main backend dependencies..."
    (cd "$ROOT_DIR/backend" && "$python_bin" -m pip install -r requirements.txt)
  fi
}

ensure_finpilot_backend_deps() {
  local python_bin="$1"
  if ! (cd "$ROOT_DIR/finpilot_ai_package/backend" && "$python_bin" -c "import fastapi, uvicorn, pydantic_settings" >/dev/null 2>&1); then
    echo "[setup] Installing FinPilot backend dependencies..."
    (cd "$ROOT_DIR/finpilot_ai_package/backend" && "$python_bin" -m pip install -r requirements.txt)
  fi
}

ensure_frontend_ready() {
  local dir="$1"

  if [[ ! -d "$dir/node_modules" ]]; then
    echo "[setup] Installing npm dependencies in $dir..."
    (cd "$dir" && npm install)
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v xattr >/dev/null 2>&1; then
    (cd "$dir" && xattr -dr com.apple.quarantine node_modules/.bin node_modules/@angular 2>/dev/null || true)
  fi
}

ensure_port_available() {
  local service="$1"
  local port="$2"

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "[error] Port $port is already in use. Cannot start $service."
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    local details
    details="$(ps -p "$pid" -o pid= -o comm= 2>/dev/null | xargs || true)"
    if [[ -n "$details" ]]; then
      echo "        $details"
    else
      echo "        pid $pid"
    fi
  done <<< "$pids"
  echo "        If these are old stack processes, run './run_all_services.sh stop' or free the port manually."

  return 1
}

validate_required_ports() {
  local had_conflict=0

  if ! service_is_running "main_backend"; then
    ensure_port_available "main_backend" 8000 || had_conflict=1
  fi

  if ! service_is_running "main_frontend"; then
    ensure_port_available "main_frontend" 4200 || had_conflict=1
  fi

  if ! service_is_running "finpilot_backend"; then
    ensure_port_available "finpilot_backend" 8010 || had_conflict=1
  fi

  if ! service_is_running "finpilot_frontend"; then
    ensure_port_available "finpilot_frontend" 4300 || had_conflict=1
  fi

  if [[ "$had_conflict" -eq 1 ]]; then
    return 1
  fi

  return 0
}

start_service() {
  local service="$1"
  local cwd="$2"
  shift 2

  local pid_file
  local log_file
  pid_file="$(pid_file_for "$service")"
  log_file="$(log_file_for "$service")"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && is_pid_running "$pid"; then
      echo "[skip] $service already running (pid $pid)"
      return 0
    fi
    rm -f "$pid_file"
  fi

  (
    cd "$cwd"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  local new_pid
  new_pid="$(cat "$pid_file")"
  echo "[ok] started $service (pid $new_pid)"
  echo "     URL: $(service_url "$service")"
  echo "     LOG: $log_file"
}

stop_service() {
  local service="$1"
  local pid_file
  pid_file="$(pid_file_for "$service")"

  if [[ ! -f "$pid_file" ]]; then
    echo "[skip] $service is not running (no pid file)"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"

  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "[skip] $service has empty pid file"
    return 0
  fi

  if ! is_pid_running "$pid"; then
    rm -f "$pid_file"
    echo "[skip] $service pid $pid is not running"
    return 0
  fi

  kill "$pid" >/dev/null 2>&1 || true

  local i
  for i in 1 2 3 4 5; do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      echo "[ok] stopped $service"
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
  echo "[ok] force-stopped $service"
}

start_all() {
  local main_python
  local finpilot_python

  if ! main_python="$(pick_python "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/backend/venv/bin/python")"; then
    echo "[error] Could not find a Python interpreter for main backend"
    exit 1
  fi

  if ! finpilot_python="$(pick_python "$ROOT_DIR/finpilot_ai_package/backend/.venv/bin/python" "$ROOT_DIR/.venv/bin/python")"; then
    echo "[error] Could not find a Python interpreter for FinPilot backend"
    exit 1
  fi

  ensure_main_backend_deps "$main_python"
  ensure_finpilot_backend_deps "$finpilot_python"
  ensure_frontend_ready "$ROOT_DIR/frontend"
  ensure_frontend_ready "$ROOT_DIR/finpilot_ai_package/frontend"

  if ! validate_required_ports; then
    echo "[error] One or more required ports are busy. Stack startup aborted."
    exit 1
  fi

  start_service "main_backend" "$ROOT_DIR/backend" \
    "$main_python" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

  start_service "main_frontend" "$ROOT_DIR/frontend" \
    npm run start -- --port 4200

  start_service "finpilot_backend" "$ROOT_DIR/finpilot_ai_package/backend" \
    "$finpilot_python" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

  start_service "finpilot_frontend" "$ROOT_DIR/finpilot_ai_package/frontend" \
    npm run start

  echo
  echo "All services start command issued."
  echo "Run './run_all_services.sh status' to verify and view URLs."
  echo "Run './run_all_services.sh logs' to tail logs."
}

stop_all() {
  local idx
  for ((idx=${#SERVICES[@]}-1; idx>=0; idx--)); do
    stop_service "${SERVICES[$idx]}"
  done
}

status_all() {
  local service
  for service in "${SERVICES[@]}"; do
    print_status_line "$service"
  done
}

tail_logs() {
  local service="${1:-}"

  if [[ -n "$service" ]]; then
    local log_file
    log_file="$(log_file_for "$service")"
    if [[ ! -f "$log_file" ]]; then
      echo "[error] Log file not found for service '$service': $log_file"
      exit 1
    fi
    echo "Tailing log for $service... (Ctrl+C to exit)"
    tail -f "$log_file"
    return
  fi

  local log_files=()
  local item
  for item in "${SERVICES[@]}"; do
    local log_file
    log_file="$(log_file_for "$item")"
    if [[ -f "$log_file" ]]; then
      log_files+=("$log_file")
    fi
  done

  if [[ ${#log_files[@]} -eq 0 ]]; then
    echo "[error] No log files found. Start services first."
    exit 1
  fi

  echo "Tailing all logs... (Ctrl+C to exit)"
  tail -f "${log_files[@]}"
}

ACTION="${1:-start}"
shift || true

case "$ACTION" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  status)
    status_all
    ;;
  logs)
    tail_logs "${1:-}"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "[error] Unknown command: $ACTION"
    usage
    exit 1
    ;;
esac
