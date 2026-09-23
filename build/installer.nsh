; Jaygo AU — 自定义 NSIS 片段
; 1. customInit: 清理任何遗留残余进程，释放文件句柄，并设置默认安装目录为 D:\JaygoAU
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Jaygo AU.exe"'
  nsExec::Exec 'taskkill /F /IM "ffmpeg.exe"'
  Sleep 300
  StrCpy $INSTDIR "D:\JaygoAU"
!macroend

; 2. 覆盖卸载清理逻辑，彻底规避 electron-builder 默认 un.atomicRMDir 重命名锁死 abort (Error 2) 的已知缺陷
!macro customRemoveFiles
  DetailPrint "正在安全清理旧版程序文件..."
  RMDir /r /REBOOTOK $INSTDIR
!macroend

; 3. 卸载初始化阶段强制终止可能残存的旧进程
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Jaygo AU.exe"'
  nsExec::Exec 'taskkill /F /IM "ffmpeg.exe"'
  Sleep 300
!macroend

!macro customInstall
  ; 强制刷新桌面图标缓存与外壳通知
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  ExecWait 'ie4uinit.exe -show'
!macroend
