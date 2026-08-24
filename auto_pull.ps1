# ==============================================================================
# SCRIPT TỰ ĐỘNG CẬP NHẬT CODE TỪ GIT (AUTO PULL)
# ==============================================================================

$projectDir = "e:\DONG BO\New Ha GCCK\Năm 2026\Dự Án AI_ Antigravity\SANLUONG2026"
$logFile = "$projectDir\auto_pull.log"

Set-Location $projectDir

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logMsg = "[$timestamp] Đang kiểm tra và tải code mới từ GitHub/GitLab..."
Write-Host $logMsg
Add-Content -Path $logFile -Value $logMsg

if (-not (Test-Path "$projectDir\.git")) {
    $err = "[$timestamp] LỖI: Chưa khởi tạo Git Repository trong thư mục dự án."
    Write-Host $err -ForegroundColor Red
    Add-Content -Path $logFile -Value $err
    exit 1
}

try {
    # Tự động stash tạm thời các thay đổi local chưa commit (nếu có)
    git stash | Out-Null

    # Pull code mới nhất từ remote
    $output = git pull origin main 2>&1
    if (-not $?) {
        # Nếu nhánh mặc định là master
        $output = git pull origin master 2>&1
    }

    $res = "[$timestamp] Kết quả: $output"
    Write-Host $res -ForegroundColor Green
    Add-Content -Path $logFile -Value $res

    # Phục hồi lại stash local (nếu có)
    git stash pop | Out-Null
} catch {
    $errEx = "[$timestamp] Ngoại lệ: $_"
    Write-Host $errEx -ForegroundColor Red
    Add-Content -Path $logFile -Value $errEx
}
