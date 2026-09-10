---
name: me2603-quiz-admin
description: Operate the ME2603 course quiz backend at https://trainnn.work on behalf of the teacher. Use when the user wants to create / edit / publish / unpublish quizzes, view or export student submissions, allow students to resubmit, or analyze class performance. Backend is Next.js + PostgreSQL behind nginx HTTPS; auth is a session cookie obtained from /api/teacher/login.
---

# ME2603 Quiz Backend

## Connection

- **Base URL**: `https://trainnn.work` (HTTPS via nginx; the Next.js app on `:3100` and webhook on `:3101` are only reachable on `127.0.0.1`)
- **Teacher password**: not stored in this skill. Obtain it from one of:
  1. **Ask the user directly** — preferred when the operator may not have SSH access. Use AskUserQuestion or a plain prompt and use the value verbatim.
  2. **Read from the server** — only if the operator already has SSH access to the `HKaliyun` alias:
     ```bash
     ssh HKaliyun 'grep ^TEACHER_PASSWORD= /var/www/ME2603/.env | cut -d= -f2'
     ```
- Do not commit the password to any tracked file.
- **Auth cookie name**: `quiz_teacher_session` (HttpOnly, `Secure: true` — sent only over HTTPS)
- **Server**: nginx terminates TLS on :443 and reverse-proxies to the Next.js app on `127.0.0.1:3100`

## Authentication

Always start a session by logging in and saving the cookie to a jar. Subsequent teacher calls reuse the jar. Student-facing endpoints do not need auth.

Pick the first option that matches your context, then run:

```bash
# Option 1: password was just provided by the user
TEACHER_PASSWORD="<paste from user>"

# Option 2: fetch from server (only if you have SSH access)
# TEACHER_PASSWORD=$(ssh HKaliyun 'grep ^TEACHER_PASSWORD= /var/www/ME2603/.env | cut -d= -f2')

CJ=/tmp/me2603_cookies.txt
rm -f "$CJ"
curl -s -c "$CJ" -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$TEACHER_PASSWORD\"}" \
  https://trainnn.work/api/teacher/login
```

Verify with `curl -s -b "$CJ" https://trainnn.work/api/teacher/session` — returns `{"authenticated":true}` when good.

## Endpoints

### Teacher (require `quiz_teacher_session` cookie)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/teacher/login` | Get session cookie |
| POST | `/api/teacher/logout` | Invalidate session |
| GET | `/api/teacher/session` | Check login state |
| GET | `/api/teacher/quizzes` | List quizzes (id, code, title, published, questionCount, submissionCount) |
| POST | `/api/teacher/quizzes` | Create quiz (returns auto-generated 6-char `code`) |
| GET | `/api/teacher/quizzes/:id` | Read full quiz incl. correct answers |
| PUT | `/api/teacher/quizzes/:id` | Update quiz (rejected if it has submissions) |
| DELETE | `/api/teacher/quizzes/:id` | Delete quiz + cascade its submissions |
| PATCH | `/api/teacher/quizzes/:id/publish` | Body: `{"published": true\|false}` |
| GET | `/api/teacher/quizzes/:id/results` | All submissions for a quiz |
| GET | `/api/teacher/quizzes/:id/export` | CSV download (UTF-8, opens in Excel) |
| DELETE | `/api/teacher/submissions/:id` | Remove one submission so the student can resubmit |

### Public (no auth)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/quizzes/:code` | Quiz prompt + options for students (no answers) |
| POST | `/api/quizzes/:code/submit` | Body: `{studentId, nickname, answers:[index,...]}` |
| GET | `/api/quizzes/:code/leaderboard` | Public leaderboard (nickname, score, time) |
| GET | `/api/health` | Health check (`{"status":"ok","database":"postgresql"}`) |

## Quiz create / edit shape

```json
{
  "title": "神经网络基础 · 课堂小测",
  "description": "配套 ME2063 课程",
  "published": true,
  "questions": [
    {
      "prompt": "ReLU 的全称是什么？",
      "options": ["Recurrent Linear Unit", "Rectified Linear Unit", "Regularized Loss Unit", "Residual Learning Unit"],
      "correctIndex": 1
    }
  ]
}
```

Validation (server returns 400 on violation):
- Title: 2–80 chars, trimmed
- Description: ≤240 chars (optional)
- Questions: 1–50 per quiz
- Each question: non-empty prompt, 2–6 options, all options non-empty after trim, `correctIndex` integer in `[0, options.length)`
- Editing requires the quiz to have zero submissions (else `QUIZ_HAS_SUBMISSIONS`)

The response is `{ "quiz": { "id": <int>, "code": "XXXXXX" } }`. The code is drawn from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I).

## Results shape

```json
{
  "quiz": { "id": 1, "code": "DEMO26", "title": "..." },
  "submissions": [
    {
      "id": 7,
      "studentId": "2024001",
      "nickname": "小明",
      "score": 4,
      "total": 5,
      "submittedAt": "2026-08-31T15:46:39.020Z"
    }
  ]
}
```

Submissions are sorted `score DESC, submittedAt ASC`. CSV export endpoint returns the same data flattened with a header row.

## Common workflows

### Create a quiz and remember the code

```bash
TEACHER_PASSWORD="<password — ask the user or ssh HKaliyun to read it>"
CJ=/tmp/me2603_cookies.txt
curl -s -c "$CJ" -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$TEACHER_PASSWORD\"}" \
  https://trainnn.work/api/teacher/login > /dev/null

cat > /tmp/quiz.json <<'JSON'
{
  "title": "新测验标题",
  "description": "可选说明",
  "published": true,
  "questions": [
    {"prompt":"题1","options":["A","B","C","D"],"correctIndex":0}
  ]
}
JSON

curl -s -b "$CJ" -X POST -H 'Content-Type: application/json' \
  --data @/tmp/quiz.json \
  https://trainnn.work/api/teacher/quizzes
# → {"quiz":{"id":3,"code":"GH7K2P"}}
```

Write complex JSON to a file (via heredoc) and post with `--data @file` — avoids shell-escaping nightmares.

### List all quizzes (with submission counts)

```bash
curl -s -b "$CJ" https://trainnn.work/api/teacher/quizzes
```

Returns `{"quizzes":[{id,code,title,isPublished,questionCount,submissionCount,createdAt}, ...]}` sorted by id DESC.

### Pull and analyze one quiz's results

```bash
curl -s -b "$CJ" https://trainnn.work/api/teacher/quizzes/$QUIZ_ID/results \
  | python3 -m json.tool
```

For class-wide analytics: pull results for each quiz, aggregate locally. There is no built-in class-wide endpoint.

### Publish / unpublish

```bash
curl -s -b "$CJ" -X PATCH -H 'Content-Type: application/json' \
  -d '{"published":true}' \
  https://trainnn.work/api/teacher/quizzes/$QUIZ_ID/publish
```

### Allow a student to retake

```bash
curl -s -b "$CJ" -X DELETE \
  https://trainnn.work/api/teacher/submissions/$SUBMISSION_ID
```

`student_id` is case-insensitive uniqueness per quiz — deleting one submission lets that student submit again.

### Export to CSV

```bash
curl -s -b "$CJ" -o results.csv \
  https://trainnn.work/api/teacher/quizzes/$QUIZ_ID/export
```

## Operating tips

1. **Re-login if a 401 appears.** Session cookie is HttpOnly and lasts 7 days but is server-issued. `GET /api/teacher/session` returns `{"authenticated":false}` on a stale cookie.
2. **Use cookie jars** (`-c / -b`) — never inline `Cookie:` headers; jar reuse is the cleanest pattern.
3. **Edit protection:** Once a quiz has any submission, `PUT` returns `QUIZ_HAS_SUBMISSIONS`. To edit, either `DELETE` each submission first or delete-and-recreate the quiz (which resets the code).
4. **Surfacing errors:** All error responses are `{"error":"<message>"}` with appropriate HTTP status. Show the `error` field to the teacher.
5. **Class analysis:** Aggregate locally with pandas / jq / python — server only exposes per-quiz data, no cross-quiz rollups.
6. **TLS via nginx:** All requests go through `https://trainnn.work`. The session cookie is `Secure: true`, so cookie jars (`-c/-b`) must be reused against the HTTPS URL — do not downgrade to plain HTTP.

## Out of scope (don't try via API)

- Editing quizzes that already have submissions (use reset-then-edit)
- Direct database SQL access (no DB credentials in agent scope)
- Bulk-resetting all submissions (loop single DELETE)
- Per-student per-question correctness (stored in DB `correctness_json` but not surfaced by API)
- Changing teacher password (requires SSH + edit `/var/www/ME2603/.env` + `pm2 restart me2603`)

## Webhook-triggered deploys

HKaliyun self-deploys on push to `main`. Two pm2 processes run on the server: `me2603` (the app) and `me2603-webhook` (the receiver).

### Where things live on HKaliyun

| Path | What |
| --- | --- |
| `/opt/me2603-webhook/server.mjs` | Webhook receiver |
| `/opt/me2603-webhook/refresh-ips.mjs` | IP allowlist refresher |
| `/var/www/ME2603/scripts/deploy.sh` | Deploy script |
| `/etc/me2603-webhook/gh-actions-cidrs.json` | Current allowlist |
| `/var/log/me2603-webhook/audit.log` | Every webhook trigger (JSON lines) |
| `/etc/systemd/system/me2603-webhook-refresh.{service,timer}` | Daily refresh timer |

### View recent triggers

```bash
ssh HKaliyun 'tail -20 /var/log/me2603-webhook/audit.log'
```

### Tail live deploy output

```bash
ssh HKaliyun 'tail -f /root/.pm2/logs/me2603-webhook-out.log'
```

### Force a re-deploy without pushing

```bash
ssh HKaliyun '/var/www/ME2603/scripts/deploy.sh'
```

### Refresh the IP allowlist immediately

```bash
ssh HKaliyun 'systemctl start me2603-webhook-refresh.service'
```

### Restart the webhook service

```bash
ssh HKaliyun 'pm2 restart me2603-webhook'
```
