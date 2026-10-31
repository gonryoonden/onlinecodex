# 비밀번호 보호 임시 접속 — 현재 BLOCKED

사용자는 2026-10-31 KST에 계정 없는 임시 HTTPS 접속을 승인했습니다. 이전 게시 금지는 이 임시 개인 접속 범위에서 변경됐으며 영구 배포/결제 승인은 아닙니다.

## 현재 확인된 결과

- 원본 앱은 localhost:3000에서 정상 응답.
- scripts/studio-private-proxy.mjs: localhost:3100에서 모든 페이지/API에 Basic 인증 적용. 무인증401/인증200 확인. 비밀번호는16자 이상, 실제 임시 비밀번호는/tmp mode600 JSON에만 보관하며 Git/로그에 넣지 않음.
- 외부Origin/교차사이트 요청403, upstream에 사용자 인증헤더/위조forwarded헤더를 전달하지 않음, 모든 응답 private/no-store.
- Node 인증/교차사이트/요청본문 보존 테스트2개 PASS.
- 인증된 실제 Chromium에서 한글편집→저장→Python PPTX다운로드 PASS.
- Cloudflare 공식2026.10.7 클라이언트를/tmp에 내려받아 보호 프록시를 대상으로 quick tunnel 시도. api.trycloudflare.com 직접DNS 연결이 거절되어 **외부URL 발급 실패**.
- HTTPS 프록시를 통한 api.trycloudflare.com 접근도 현재 정책403. /etc/codex/network-policy.json에서 tcp_network_access.domains와ip_ranges 모두 비어 있음. 네트워크 정책을 우회하지 않음.

## 저장한 환경 설정 초안

기존 Gemini 도메인을 유지하고 api.trycloudflare.com, *.trycloudflare.com, region1.v2.argotunnel.com, region2.v2.argotunnel.com을 HTTPS 허용 목록 초안에 추가. start_skill에 인증 실행/검증/실패 재개 절차를 저장. 저장은 성공했지만 적용·게시를 뜻하지 않음. 환경 설정에서 검토·저장 후 게시가 필요함.

**이 HTTPS 목록만 적용해도 터널이 된다는 뜻은 아닙니다.** cloudflared가 요구하는 외부DNS와edge TCP7844 연결이 별도로 필요하며, 현재 사용 가능한 환경설정 도구에는 TCP허용 수정 기능이 없습니다. 이 권한을 제공하는 실행환경/플랫폼 설정 없이는 이 방식으로 링크를 발급할 수 없습니다. 존재하지 않는URL이나 localhost를 외부 접속 주소로 안내하지 않습니다.

## 권한이 갖춰진 환경에서 재개

```bash
cd /workspace/onlinecodex
node --test tests/studio/private-proxy.test.mjs
# 비공개 JSON: {"username":"studio","password":"<16자 이상 무작위 암호>"}
# 파일은 저장소 밖 mode600. 실제 암호를 아래 명령/로그/Git에 기입하지 않음.
STUDIO_PREVIEW_CREDENTIAL_FILE=/private/path/credentials.json node scripts/studio-private-proxy.mjs
# 별도 프로세스, 반드시 보호 프록시3100으로 연결:
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3100 --protocol http2
```

실제 HTTPS주소에서 인증 없을 때401, 인증 후200, 편집/저장/출력까지 재검증한 경우에만 URL과 임시 사용자 자격정보를 사용자에게 전달. 터널 프로세스에 Gemini키를 넘길 필요 없음. 환경/프로세스 종료 시 주소는 만료될 수 있음. 새 주소는 별도브라우저저장소이므로 기존프로젝트는ZIP으로 이동.
