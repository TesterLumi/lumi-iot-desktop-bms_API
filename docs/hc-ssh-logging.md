# Home Controller SSH logging

Shared E2E suites read Home Controller SSH configuration from `.env`.

Required local variables:

```env
HC_SSH_HOST=10.10.30.154
HC_SSH_USER=root
HC_SSH_KEY_PATH=C:\Users\thuyv\Downloads\key ssh\hcg1_Lumi
HC_SSH_KEY_PASSPHRASE=<local-passphrase>
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

Do not commit `.env`. Keep secrets in local env only.

Suites that attach HC logs on failure should use the shared `HC_SSH_*` and
`HC_LOG_*` variables instead of feature-specific SSH configuration.

When a testcase fails, the evidence should capture the Home Controller log for
that testcase's own execution window, not an unrelated broad tail. Evidence
should include:

- testcase start/end ISO timestamps;
- HC log window in `YYYY-MM-DD HH:mm:ss` Asia/Bangkok time;
- filtered HC log lines from that window.
