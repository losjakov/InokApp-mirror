#!/usr/bin/env bash
# ci_dead_mirror.sh - A-87 (1d): the 11.11.2026 outage, planted in EVERY build / screens / emulator job, every run. The Ubuntu mirrors are
# pointed at 0.0.0.0 before any of our steps: no step of the normal path may need them (apt is gone from it), so a green run is the
# proof, and a step that brings apt back fails at once as «INFRA … ubuntu.com» (scripts/ci_infra.py), never as a test.
# A step that truly needs a system package one day = a deliberate change here + REF_app_testing «Before a run».
set -euo pipefail
HOSTS="azure.archive.ubuntu.com archive.ubuntu.com security.ubuntu.com esm.ubuntu.com ppa.launchpadcontent.net"
echo "0.0.0.0 $HOSTS # A-87 planted dead mirror" | sudo tee -a /etc/hosts > /dev/null
mkdir -p "${INOK_CI_DIR:-/tmp/inok-ci}"
if curl -sS --max-time 10 -o /dev/null http://azure.archive.ubuntu.com/ubuntu/ 2>/dev/null; then
  echo "::error::the planted dead mirror still answers - the plant does not work"; exit 1; fi
echo "- A-87 planted dead mirror: $HOSTS -> 0.0.0.0 (curl to azure.archive.ubuntu.com refused); apt is not in this job's path" | tee -a "${INOK_CI_DIR:-/tmp/inok-ci}/summary.md"
