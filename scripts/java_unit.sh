#!/usr/bin/env bash
# java_unit.sh - the PURE-Java notification rules (android/app/src/main/java/info/inok/app/Notifier.java, A-84) and their JUnit test,
# compiled and run with the sandbox's own javac (no Android SDK here; CI runs the same test by `gradlew testDebugUnitTest`).
# JUnit 4.13.2 + hamcrest 1.3 from Maven Central (or its Google mirror) into ~/.cache/inok-junit once.
set -euo pipefail
cd "$(dirname "$0")/.."
J="${HOME}/.cache/inok-junit"; mkdir -p "$J"
for u in junit/junit/4.13.2/junit-4.13.2.jar org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar; do
  # A-87 (1b): Maven Central, then Google's mirror of it - each retried with back-off
  f="$J/$(basename "$u")"; [ -s "$f" ] || for m in https://repo1.maven.org/maven2 https://maven-central.storage-download.googleapis.com/maven2; do
    curl -fsSL --retry 3 --retry-delay 5 --max-time 60 -o "$f" "$m/$u" && break; rm -f "$f"; done
  [ -s "$f" ] || { echo "INFRA: Maven Central and its mirror unreachable ($u)"; exit 75; }
done
O="$(mktemp -d)"; trap 'rm -rf "$O"' EXIT
P=android/app/src/main/java/info/inok/app; T=android/app/src/test/java/info/inok/app
javac -d "$O" -cp "$J/junit-4.13.2.jar" $P/Notifier.java $P/NavOverlap.java $T/NotifierTest.java $T/NavOverlapTest.java 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
java -cp "$O:$J/junit-4.13.2.jar:$J/hamcrest-core-1.3.jar" org.junit.runner.JUnitCore info.inok.app.NotifierTest info.inok.app.NavOverlapTest 2>&1 | grep -v JAVA_TOOL_OPTIONS | grep -E '^(OK|FAILURES|Tests run|[0-9]+\))' 
