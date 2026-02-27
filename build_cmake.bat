@echo off
cd /d "%~dp0"
call "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat" -arch=x64 -no_logo
cmake -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=Debug
