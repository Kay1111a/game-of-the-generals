# Snakes & Ladders
Open index.html for the offline browser game. Play against Easy, Medium or Hard, or share one device with two to four players. Reach square 100 exactly. All players use a fair six-sided die. In solo play each side gets two optional rerolls. Easy keeps every roll, Medium retries snake setbacks, and Hard compares the current landing with possible alternatives and their next moves.
 
The Windows x64 app uses Edge WebView2. The Android app requires Android 9 or later with current System WebView. Build with native/windows/build.ps1 or Gradle 8.9 and JDK 17 using gradle -p native/android :app:assembleRelease. The workflow plays all six match types in the packaged apps.
