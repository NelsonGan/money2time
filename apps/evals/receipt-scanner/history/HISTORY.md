# Receipt-scanner eval history

Every eval run, newest first, written and committed by `apps/evals/receipt-scanner/run.mjs`.
Scores are the Opus judge's (0-100; the check-based auto score when a run had no judge).
Compare rows only on the same dataset and rubric. Cost per 1,000 scans includes prompt
caching; time is UTC; Code is the commit measured (`+` = with uncommitted eval or Worker edits).

| Run (UTC) | Model | Cases | Score | Strict | quick | itemized | screenshot | Wrong/guessed acct | Invented payments | Cost / 1k | p50 | Dataset | Code | Details |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-09 06:35 | `claude-code:claude-haiku-5-5` | 139 | **98.2** | 96.1% | 99.5 | 99.0 | 96.0 | 4.5% | 20.0% | $0.69 | 2.8s | `0f928af7faa1c4b2` | `e6727050` | [report](runs/2026-10-09T06-35-05-251.md) |
| 2026-10-09 06:13 | `deepseek/deepseek-v4.1-flash` | 139 | **97.8** | 97.2% | 97.8 | 98.8 | 96.6 | 0.0% | 20.0% | $0.27 | 0.6s | `0f928af7faa1c4b2` | – | [report](runs/2026-10-09T06-13-58-685.md) |
| 2026-10-09 06:13 | `qwen/qwen3.7-flash` | 139 | **97.9** | 97.7% | 99.4 | 99.6 | 94.6 | 2.3% | 40.0% | $0.06 | 1.3s | `0f928af7faa1c4b2` | – | [report](runs/2026-10-09T06-13-58-685.md) |
