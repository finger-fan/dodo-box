#!/bin/bash
#
# Unified deployment script for OTA updates + APK + landing page
#
# Usage:
#   bash scripts/cap-deploy.sh <user@host:/path/to/site> [--apk path/to.apk] [--notes "release notes"] [--dry-run]
#
# Example:
#   bash scripts/cap-deploy.sh user@example.com:/var/www/dodobox --apk android/app/build/outputs/apk/release/app-release.apk --notes "Bug fixes"
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Default values
DRY_RUN=false
APK_PATH=""
NOTES=""
REMOTE=""

# Help message
function show_help() {
    echo "Usage: bash scripts/cap-deploy.sh <user@host:/path> [OPTIONS]"
    echo ""
    echo "Arguments:"
    echo "  user@host:/path     Remote server and path for deployment"
    echo ""
    echo "Options:"
    echo "  --apk <path>        Path to APK file to deploy"
    echo "  --notes <text>      Release notes for this version"
    echo "  --dry-run           Show what would be done without executing"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Example:"
    echo "  bash scripts/cap-deploy.sh user@example.com:/var/www/dodobox --apk ./app.apk --notes \"Bug fixes\""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --apk)
            APK_PATH="$2"
            shift 2
            ;;
        --notes)
            NOTES="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            exit 1
            ;;
        *)
            if [[ -z "$REMOTE" ]]; then
                REMOTE="$1"
            else
                echo -e "${RED}Error: Unexpected argument $1${NC}"
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$REMOTE" ]]; then
    echo -e "${RED}Error: Remote destination is required${NC}"
    show_help
    exit 1
fi

# Read version from package.json
function get_version() {
    node -e "console.log(require('$ROOT_DIR/package.json').version)"
}

VERSION=$(get_version)
echo -e "${BLUE}Deploying dodo-box v${VERSION}${NC}"

# Step 1: Build OTA bundle
echo -e "${BLUE}[1/5] Building OTA bundle...${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  [DRY-RUN] Would run: pnpm cap:bundle --notes \"$NOTES\"${NC}"
else
    cd "$ROOT_DIR"
    if [[ -n "$NOTES" ]]; then
        pnpm cap:bundle --notes "$NOTES"
    else
        pnpm cap:bundle
    fi
fi

# Step 2: Copy bundle to site/updates/
echo -e "${BLUE}[2/5] Copying bundle to site/updates/${VERSION}/...${NC}"
SITE_UPDATES_DIR="$ROOT_DIR/site/updates"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  [DRY-RUN] Would create: $SITE_UPDATES_DIR/$VERSION/${NC}"
    echo -e "${YELLOW}  [DRY-RUN] Would copy: dist/updates/$VERSION/bundle.zip${NC}"
    echo -e "${YELLOW}  [DRY-RUN] Would copy: dist/updates/manifest.json${NC}"
else
    mkdir -p "$SITE_UPDATES_DIR/$VERSION"
    cp "$ROOT_DIR/dist/updates/$VERSION/bundle.zip" "$SITE_UPDATES_DIR/$VERSION/"
    cp "$ROOT_DIR/dist/updates/manifest.json" "$SITE_UPDATES_DIR/"
    echo -e "${GREEN}  Copied bundle to site/updates/$VERSION/${NC}"
fi

# Step 3: Copy APK if provided
APK_FILENAME="dodo-box-${VERSION}.apk"
if [[ -n "$APK_PATH" ]]; then
    echo -e "${BLUE}[3/5] Copying APK to site/apks/...${NC}"
    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${YELLOW}  [DRY-RUN] Would copy: $APK_PATH -> site/apks/$APK_FILENAME${NC}"
    else
        if [[ ! -f "$APK_PATH" ]]; then
            echo -e "${RED}Error: APK not found at $APK_PATH${NC}"
            exit 1
        fi
        mkdir -p "$ROOT_DIR/site/apks"
        cp "$APK_PATH" "$ROOT_DIR/site/apks/$APK_FILENAME"
        echo -e "${GREEN}  Copied APK to site/apks/$APK_FILENAME${NC}"
    fi
else
    echo -e "${YELLOW}[3/5] Skipping APK (not provided)${NC}"
fi

# Step 4: Update versions.json
echo -e "${BLUE}[4/5] Updating versions.json...${NC}"
VERSIONS_FILE="$ROOT_DIR/site/versions.json"
TODAY=$(date +%Y-%m-%d)

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  [DRY-RUN] Would update: $VERSIONS_FILE${NC}"
else
    # Read current versions.json or create new one
    if [[ -f "$VERSIONS_FILE" ]]; then
        VERSIONS_JSON=$(cat "$VERSIONS_FILE")
    else
        VERSIONS_JSON='{"latest":"","releases":[]}'
    fi

    # Use Node.js to update versions.json
    node -e "
        const fs = require('fs');
        const data = $VERSIONS_JSON;
        const version = '$VERSION';
        const date = '$TODAY';
        const notes = '$NOTES' || 'Update to version ' + version;
        const hasApk = $([[ -n '$APK_PATH' ]] && echo 'true' || echo 'false');

        // Find existing release
        const existingIndex = data.releases.findIndex(r => r.version === version);

        const release = {
            version: version,
            date: date,
            versionCode: parseInt(version.split('.').join('')),
            apk: hasApk ? 'apks/$APK_FILENAME' : (existingIndex >= 0 ? data.releases[existingIndex].apk : ''),
            bundle: 'updates/' + version + '/bundle.zip',
            notes: notes
        };

        if (existingIndex >= 0) {
            // Update existing
            data.releases[existingIndex] = release;
        } else {
            // Add new release at the beginning
            data.releases.unshift(release);
        }

        data.latest = version;

        fs.writeFileSync('$VERSIONS_FILE', JSON.stringify(data, null, 2) + '\\n');
        console.log('Updated versions.json');
    "
    echo -e "${GREEN}  Updated versions.json${NC}"
fi

# Step 5: Deploy to remote server
echo -e "${BLUE}[5/5] Deploying to remote server...${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  [DRY-RUN] Would run: rsync -avz --delete $ROOT_DIR/site/ $REMOTE${NC}"
    echo ""
    echo -e "${GREEN}Dry run complete. No changes were made.${NC}"
else
    # Check if rsync is available
    if ! command -v rsync &> /dev/null; then
        echo -e "${RED}Error: rsync is not installed${NC}"
        exit 1
    fi

    # Deploy site/
    echo -e "${BLUE}  Uploading to $REMOTE...${NC}"
    rsync -avz --delete "$ROOT_DIR/site/" "$REMOTE"

    echo ""
    echo -e "${GREEN}Deployment complete!${NC}"
    echo -e "${GREEN}  Version: v${VERSION}${NC}"
    if [[ -n "$APK_PATH" ]]; then
        echo -e "${GREEN}  APK: site/apks/$APK_FILENAME${NC}"
    fi
    echo -e "${GREEN}  Bundle: site/updates/$VERSION/bundle.zip${NC}"
fi
