#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DATA="$ROOT_DIR/docker"

# scp -r ${DOCKER_DATA} node-us:/data/docker/dodo-box
rsync -avz --delete ${DOCKER_DATA}/ node-us:/data/docker/dodo-box/
