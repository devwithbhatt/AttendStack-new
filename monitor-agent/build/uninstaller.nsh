!macro customUnInit
  ; Check if ZuperHR Monitor is running — if so, block uninstall.
  ; The app requires an admin password to quit, so this effectively
  ; makes uninstall require the password too.
  FindWindow $0 "" "ZuperHR Monitor"
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "ZuperHR Monitor is currently running.$\n$\nPlease close the application first (admin password required).$\nRight-click the system tray icon and choose Quit."
    Abort
  ${EndIf}

  ; Also check by process name
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ZuperHR Monitor.exe" /NH'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $2 $1 20
    ${If} $2 != "INFO: No tasks"
      MessageBox MB_OK|MB_ICONEXCLAMATION "ZuperHR Monitor is currently running.$\n$\nPlease close the application first (admin password required).$\nRight-click the system tray icon and choose Quit."
      Abort
    ${EndIf}
  ${EndIf}
!macroend
