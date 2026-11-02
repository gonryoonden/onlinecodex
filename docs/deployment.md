# 개인용 실행과 배포

실제 인터넷 배포는 수행하지 않았습니다. 호스팅 계정·도메인·HTTPS·인증 설정이 제공되지 않았으며 공개 무인증 배포는 허용하지 않습니다.

## 검증된 Linux 로컬 실행

Node 24 / Python 3.12, Chrome(Chromium). `scripts/setup-studio`로 Python venv와 npm lockfile 의존성을 설치한 뒤 README대로 시작합니다. `next start`도 127.0.0.1에만 바인딩됩니다. 한 사용자·한 서버 프로세스가 기본 운영 범위입니다.

## Windows

권장 재현 경로는 WSL2 Ubuntu + Node 24 + Python 3.12입니다. 저장소를 WSL 파일시스템에 clone한 뒤 Linux 명령을 사용하고 Windows Chrome에서 localhost:3000을 엽니다. WSL 자체는 이 Linux 환경에서 검증할 수 없었습니다.

보조 PowerShell 경로: `./scripts/setup-studio.ps1`, `$env:STUDIO_PYTHON=(Resolve-Path ./.venvs/studio/Scripts/python.exe).Path`, `npm --prefix apps/studio run dev`. Windows 네이티브/PowerShell 실제 실행은 **미검증**입니다. 경로 인수는 spawn 배열로 넘기므로 사용자 경로를 shell 코드로 실행하지 않습니다.

## 개인용 원격 서버 (사용자 설정 후 검증 필요)

1. Node/Python을 함께 실행할 수 있는 개인 서버에 checkout. `scripts/setup-studio`와 build/typecheck/tests를 먼저 실행합니다.
2. 인증된 HTTPS reverse proxy(예: 개인 VPN + 접근 제어 gateway)를 localhost Node 앞에 구성합니다. 공개 로컬 포트 바인딩으로 대체하지 마세요.
3. gateway에서 사용자 인증 후 모든 요청을 전달하고 서버 전용 `STUDIO_ACCESS_TOKEN`과 같은 `Authorization: Bearer ...`를 주입합니다. 앱 UI에는 토큰을 저장하지 않습니다. 토큰 환경변수는 호스팅 비밀 저장소에 등록합니다.
4. 유효한 Origin/Host를 보존하고 body 크기 100MB 이하, 요청 제한, TLS, 캐시 정책을 설정합니다. 인증 실패/다른 Origin/토큰 없는 API 요청이 거부되는지 검사합니다. 클라이언트 저장소는 도메인/포트/브라우저별로 분리됩니다. 이전 로컬 프로젝트는 ZIP으로 이동하세요.
5. 이미지 업로드→편집→저장→재접속→ZIP→PPTX까지 실사용 계정으로 검증한 뒤 사용합니다.

Vercel 표준 서버리스에는 이 Python subprocess 엔진이 포함되지 않습니다. 이 앱을 그대로 올려 PPTX가 된다고 주장하지 않습니다. Vercel frontend를 택하려면 별도 인증된 Python worker 서비스/저장 경로와 서버간 인증을 먼저 구현·검증해야 합니다(현재 미구현). 무거운 GPU/유료 리소스는 생성하지 않았습니다. localhost 서버의 외부 노출은 이 작업에 포함되지 않습니다.
