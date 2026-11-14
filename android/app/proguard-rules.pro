# InokApp R8 rules (A-83, ref/FUTURE_play_quality.md §3). The release and qa builds read this file; debug never runs R8.
# NO keep rule here by default: Capacitor (@CapacitorPlugin / @PluginMethod, the bridge), SQLCipher (JNI), Firebase, Play Integrity,
# AndroidX ship their own consumer rules; the manifest keeps InokMessagingService and MainActivity. A rule is added ONLY for a crash
# reproduced in the minified (qa) build, as narrow as one class / member, with a comment naming the crash. Never -dontoptimize,
# -dontobfuscate, -dontshrink or a package-wide keep (Play's DEX optimization score).

# Readable stack traces in Play's crash reports (deobfuscated with the build's mapping.txt); attributes only, nothing kept.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
