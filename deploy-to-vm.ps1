# Automated VM Deployment Script
# Usage: .\deploy-to-vm.ps1 "Your commit message"

param(
    [string]$CommitMessage = "Update deployment",
    [switch]$SkipEncryptionKey = $false
)

$VM_USER = "samson090281"
$VM_IP = "34.65.169.15"
$VM_DOMAIN = "rvtpub.digibuild.ch"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Automated VM Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if there are changes to commit
Write-Host "Checking for changes..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "Changes detected, committing..." -ForegroundColor Green
    git add .
    git commit -m "$CommitMessage"
} else {
    Write-Host "No changes to commit" -ForegroundColor Gray
}

# Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
git push origin master
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push to GitHub!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Pushed to GitHub" -ForegroundColor Green

# Check if encryption key needs to be generated
if (-not $SkipEncryptionKey) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Encryption Key Check" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    $generateKey = Read-Host "Do you need to generate an encryption key? (y/N)"
    if ($generateKey -eq 'y' -or $generateKey -eq 'Y') {
        Write-Host "`nGenerating encryption key..." -ForegroundColor Yellow
        node generate-encryption-key.js
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: Save this key securely!" -ForegroundColor Red
        Write-Host "You'll need it for both VM and Cloud Functions setup" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter when you've saved the key"
    }
}

# Deploy to VM instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VM Deployment Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Code pushed to GitHub successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "STEP 1: SSH to VM" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Gray
Write-Host "Option A - Google Cloud Console (Recommended):" -ForegroundColor White
Write-Host "  1. Go to: https://console.cloud.google.com" -ForegroundColor Gray
Write-Host "  2. Navigate to: Compute Engine → VM instances" -ForegroundColor Gray
Write-Host "  3. Click SSH button next to your VM" -ForegroundColor Gray
Write-Host ""
Write-Host "Option B - Direct SSH:" -ForegroundColor White
Write-Host "  ssh $VM_USER@$VM_IP" -ForegroundColor Gray
Write-Host ""

Write-Host "STEP 2: Deploy Code" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Gray
Write-Host "Run this command on the VM:" -ForegroundColor White
Write-Host ""
$deployCmd = "cd ~/revit-publisher && git pull origin master && pm2 restart revit-publisher && pm2 logs --lines 30"
Write-Host $deployCmd -ForegroundColor Cyan
Write-Host ""
Set-Clipboard -Value $deployCmd
Write-Host "✓ Command copied to clipboard!" -ForegroundColor Green
Write-Host ""

if (-not $SkipEncryptionKey) {
    Write-Host "STEP 3: Configure Encryption Key (if not already set)" -ForegroundColor Yellow
    Write-Host "--------------------------------------" -ForegroundColor Gray
    Write-Host "On the VM, add encryption key to .env:" -ForegroundColor White
    Write-Host ""
    Write-Host "  nano ~/revit-publisher/.env" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Add this line:" -ForegroundColor White
    Write-Host "  ENCRYPTION_KEY=your_generated_hex_key_here" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Then restart:" -ForegroundColor White
    Write-Host "  pm2 restart revit-publisher" -ForegroundColor Gray
    Write-Host ""

    Write-Host "STEP 4: Configure Cloud Functions" -ForegroundColor Yellow
    Write-Host "--------------------------------------" -ForegroundColor Gray
    Write-Host "On your local machine, run:" -ForegroundColor White
    Write-Host ""
    Write-Host '  firebase functions:config:set encryption.key="your_generated_hex_key_here"' -ForegroundColor Gray
    Write-Host "  firebase deploy --only functions" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Checklist" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "- Code pushed to GitHub" -ForegroundColor Gray
Write-Host "- SSH to VM and pull latest code" -ForegroundColor Gray
Write-Host "- PM2 restarted" -ForegroundColor Gray
Write-Host "- Encryption key configured (if needed)" -ForegroundColor Gray
Write-Host "- Cloud Functions updated (if needed)" -ForegroundColor Gray
Write-Host "- Test at: https://$VM_DOMAIN" -ForegroundColor Gray
Write-Host ""
Write-Host "✓ Ready to Deploy!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
