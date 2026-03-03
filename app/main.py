from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from scoring import FitScorer

scorer = FitScorer()


class ScoreHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (stdlib method name)
        if self.path != "/score":
            self._send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        job_description = payload.get("job_description", "")
        resume_text = payload.get("resume_text", "")

        if not job_description or not resume_text:
            self._send_json(400, {"error": "job_description and resume_text are required"})
            return

        result = scorer.score(job_description, resume_text)
        self._send_json(200, result)

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str = "0.0.0.0", port: int = 8000) -> None:
    server = HTTPServer((host, port), ScoreHandler)
    print(f"Fit scorer server running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
