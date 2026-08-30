@echo off
chcp 65001 >nul
REM ============================================================
REM  把桌宠Mini 推送到 GitHub（在能访问 GitHub 的网络下运行）
REM
REM  前置：先在 https://github.com/new 建一个空仓库（不要勾 README）
REM  用法：双击本文件，粘贴仓库地址回车即可
REM ============================================================

cd /d "%~dp0\.."

echo.
echo ==== 桌宠Mini - 推送到 GitHub ====
echo.
echo 请先到 https://github.com/new 创建好空仓库，
echo 然后复制仓库地址（形如 https://github.com/你的用户名/仓库名.git）
echo.
set /p REPO=粘贴仓库地址:

if "%REPO%"=="" (
    echo 未输入地址，已取消。
    pause
    exit /b 1
)

echo.
echo ---- 配置远端 ----
git remote remove origin 2>nul
git remote add origin "%REPO%"
if errorlevel 1 (
    echo 远端配置失败，请检查地址是否正确。
    pause
    exit /b 1
)

echo ---- 推送中（约 110MB，视网速需要几分钟）----
git branch -M master
git push -u origin master
if errorlevel 1 (
    echo.
    echo 推送失败。常见原因：
    echo   1. 网络连不上 GitHub（可开代理后重试）
    echo   2. 需要登录：GitHub 已不再支持密码，请到
    echo      Settings - Developer settings - Personal access tokens 生成 token，
    echo      弹窗登录时用户名填你的 GitHub 用户名，密码填该 token
    echo   3. 仓库地址写错
    pause
    exit /b 1
)

echo.
echo ==== 推送成功！====
echo.
echo 下一步：打开 %REPO% 对应仓库页面
echo   Actions -^> Build macOS -^> Run workflow -^> 选 arm64 或 x64 -^> 运行
echo 约 10 分钟后即可下载成品 dmg / zip
echo.
pause
