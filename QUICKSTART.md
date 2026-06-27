# AUBS FastEngine — Quick Start

## 30 Seconds To Running

### Step 1: Start Local Server
```bash
cd /path/to/aubs-fastengine-github/app
python -m http.server 8000
```

Keep this terminal open. You should see:
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

### Step 2: Open Browser
Copy and paste into Chrome/Firefox/Safari:
```
http://localhost:8000/fastengine-test.html
```

### Step 3: Click Button
Click **"Run FastEngine Test"**

Wait for the results.

---

## What You'll See

**Dashboard shows:**
- WebLLM: Detected / Not Available
- Engine: FastEngine / MockEngine
- Model Status: Loading → Ready
- Load Time: milliseconds
- Test Results: 5 prompts with response types (REAL or MOCK)

**After test completes:**
- Click **"Copy Test Report"**
- Paste it anywhere to see full results

---

## Success Indicators

✅ **FastEngine is working:**
- Engine shows "FastEngine"
- Responses show "REAL"
- Response times: 2-10 seconds
- Load time: 30-120 seconds

⚠️ **Fallback to MockEngine (still works):**
- Engine shows "MockEngine"
- Responses show "MOCK"
- Response times: ~500ms
- Load time: N/A

---

## Run The Full App

```
http://localhost:8000/aubs-shell.html
```

Click "Enter AUBS" → Select "Fast" → Start chatting

---

## Troubleshooting

**"File not found" error?**
- Check you're in the right folder
- Make sure `fastengine-test.html` is there

**"WebLLM not available" in dashboard?**
- Make sure you're using `http://localhost:8000/`, not `file://`
- WebLLM requires HTTPS or localhost (security restriction)

**Model takes a long time to load?**
- Normal (30-120 seconds first time)
- Cached after that
- Check your internet speed

**Responses are generic placeholders?**
- That's MockEngine fallback (normal if WebLLM unavailable)
- App still works, just not running the real model

---

## Full Documentation

See README.md for:
- Architecture overview
- File descriptions
- Detailed validation procedures
- Troubleshooting guide

See `/docs` folder for technical docs on each module.

---

**Ready?** Start the server and open the test page! 🚀
