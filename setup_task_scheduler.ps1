# ==============================================================================
# SCRIPT ĐĂNG KÝ TASK SCHEDULER CHẠY AUTO PULL TỰ ĐỘNG MỖI 5 PHÚT
# ==============================================================================

$taskName = "SANLUONG2026_Git_AutoPull"
$scriptPath = "e:\DONG BO\New Ha GCCK\Năm 2026\Dự Án AI_ Antigravity\SANLUONG2026\auto_pull.ps1"

# Hành động: Chạy PowerShell ẩn cửa sổ và thực thi file auto_pull.ps1
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

# Lịch trình: Lặp lại mỗi 5 phút liên tục
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)

# Đăng ký Task vào Windows Task Scheduler
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "Tự động pull code Git mỗi 5 phút cho dự án SANLUONG2026" -Force

Write-Host "Đã đăng ký thành công Task Scheduler: $taskName" -ForegroundColor Green
