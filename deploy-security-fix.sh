#!/bin/bash
# VM Deployment Script - Run this on your VM
# Emergency Security Fix Deployment - March 27, 2026

set -e  # Exit on error

echo "=========================================="
echo "CRITICAL SECURITY FIX DEPLOYMENT"
echo "=========================================="
echo ""

# Navigate to project directory
cd ~/revit-publisher || cd ~/RevitAutomation

echo "1. Pulling latest security fix from GitHub..."
git pull origin master

echo ""
echo "2. Checking dependencies..."
npm install

echo ""
echo "3. Restarting server with PM2..."
pm2 restart revit-publisher || pm2 start server.js --name revit-publisher

echo ""
echo "4. Checking server status..."
pm2 status

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Recent logs:"
pm2 logs revit-publisher --lines 15 --nostream

echo ""
echo "🔒 Security fix deployed successfully!"
echo "   - OAuth login now uses POST instead of GET"
echo "   - Firebase tokens no longer exposed in URLs"
echo "   - Chrome 'Dangerous site' warning should be resolved"
echo ""
echo "Next steps:"
echo "1. Clear your browser cache and history"
echo "2. Test login at: https://rvtpub.digibuild.ch"
echo "3. Verify OAuth flow works correctly"
echo ""
