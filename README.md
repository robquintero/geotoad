# Geotoad

Geotoad is a geography trivia game with a daily challenge and an unlimited freestyle mode. It is a static web app built with HTML, CSS, and vanilla JavaScript; no build step or package installation is required.

## Run locally

From the project directory, start a local web server:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser. Stop the server with `Ctrl+C`.

## Deploy with Vercel

Import this repository into Vercel and deploy it as a static site:

- Framework preset: **Other**
- Build command: leave blank
- Output directory: `.` (the project root)

Vercel serves `index.html` from the project root.
