#!/bin/sh
set -e
cd "$(dirname "$0")"

case "${1}" in
  up)   docker compose -f docker-compose.dodo.yml up -d ;;
  down) docker compose -f docker-compose.dodo.yml down ;;
  *)    echo "Usage: $0 {up|down}" && exit 1 ;;
esac
