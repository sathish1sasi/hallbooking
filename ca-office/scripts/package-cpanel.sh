#!/usr/bin/env bash
# Builds the upload package for cPanel: deploy/ca-office-cpanel.zip
# Unzip it inside public_html. It contains the app (static files) and api/ (PHP).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .next out build-cpanel
npm run build
mkdir -p build-cpanel deploy
cp -r out/. build-cpanel/
mkdir -p build-cpanel/api
cp -r php-api/index.php php-api/install.php php-api/cron.php php-api/config.sample.php php-api/lib php-api/.htaccess php-api/.user.ini build-cpanel/api/
cp mysql/schema.sql build-cpanel/api/schema.sql
cp deploy-files/htaccess-root build-cpanel/.htaccess
rm -f deploy/ca-office-cpanel.zip
( cd build-cpanel && python3 -c "
import os, zipfile
with zipfile.ZipFile('../deploy/ca-office-cpanel.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk('.'):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, '.'))
" )
echo "Created deploy/ca-office-cpanel.zip ($(du -h deploy/ca-office-cpanel.zip | cut -f1))"
