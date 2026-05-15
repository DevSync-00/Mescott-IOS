@echo off
REM Mescott Webhook Server Deployment Script for Windows

echo 🚀 Deploying Mescott Webhook Server...

REM Check if Vercel CLI is installed
where vercel >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Vercel CLI not found. Installing...
    npm install -g vercel
)

REM Check if user is logged in to Vercel
vercel whoami >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo 🔐 Please login to Vercel first:
    vercel login
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Deploy to Vercel
echo 🚀 Deploying to Vercel...
vercel --prod

echo ✅ Deployment complete!
echo 🌐 Your webhook URL will be shown above

echo.
echo 📝 Next steps:
echo 1. Update your Chapa dashboard with the webhook URL
echo 2. Set environment variables in Vercel dashboard:
echo    - SUPABASE_URL
echo    - SUPABASE_ANON_KEY
echo    - CHAPA_WEBHOOK_SECRET
echo 3. Test the webhook with a sample payment

echo.
echo 🔍 To monitor logs:
echo vercel logs

pause
