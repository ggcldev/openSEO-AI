import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8000";

export const options = {
  scenarios: {
    warmup_10: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      exec: "historyLoad",
    },
    sustained_50: {
      executor: "constant-vus",
      vus: 50,
      duration: "45s",
      exec: "historyLoad",
      startTime: "30s",
    },
    burst_100: {
      executor: "constant-vus",
      vus: 100,
      duration: "30s",
      exec: "historyLoad",
      startTime: "75s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

export function historyLoad() {
  const response = http.get(`${BASE_URL}/api/history?limit=50`);
  check(response, {
    "status is 200": (r) => r.status === 200,
  });
  sleep(0.2);
}
