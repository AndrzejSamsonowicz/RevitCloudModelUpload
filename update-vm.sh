#!/bin/bash
# Update VM Script
# Run this on your VM after SSHing to it

cd ~/revit-publisher

echo "Pulling latest code from GitHub..."
git pull origin master

echo "Adding Cloud Function auth key to .env..."
echo 'CLOUD_FUNCTION_AUTH_KEY=h48qZSyxDkdbR1weAzFfjOuVYQtmETs2' >> .env

echo "Restarting PM2 process..."
pm2 restart revit-publisher

echo "Showing recent logs..."
pm2 logs revit-publisher --lines 20
