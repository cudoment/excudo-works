# Usage: powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File credential.ps1 <credential-name>
param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorksCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Entry {
  public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
  public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool Read(string target, UInt32 type, UInt32 flags, out IntPtr credential);
 [DllImport("advapi32.dll", EntryPoint="CredFree")]
 public static extern void Free(IntPtr credential);
}
'@
$pointer = [IntPtr]::Zero
if (-not [WorksCredential]::Read($Target, 1, 0, [ref]$pointer)) { exit 1 }
try {
 $entry = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][WorksCredential+Entry])
 [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringUni($entry.CredentialBlob, $entry.CredentialBlobSize / 2))
} finally { [WorksCredential]::Free($pointer) }
