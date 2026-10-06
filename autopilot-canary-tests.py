"""Autopilot canary verification test."""
import json, os, unittest

class TestCanaryArtifacts(unittest.TestCase):
    def test_notification(self):
        path = "/srv/agent-platform/projects/agent-infra/state/autopilot-canary/live-poller-notification.json"
        self.assertTrue(os.path.isfile(path), f"Missing: {path}")
        with open(path) as f:
            data = json.load(f)
        self.assertEqual(data["status"], "passed")
        self.assertEqual(data["exit_code"], 0)

    def test_report(self):
        path = "/srv/agent-platform/projects/agent-infra/state/autopilot-canary/live-poller-report.json"
        self.assertTrue(os.path.isfile(path), f"Missing: {path}")
        with open(path) as f:
            data = json.load(f)
        self.assertEqual(data["status"], "verified")
        self.assertEqual(data["case"], "success")
        self.assertIn("planner", data["roles"])
        self.assertIn("verifier", data["roles"])
