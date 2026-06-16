package dk.betterlectio.android

import io.flutter.embedding.android.FlutterActivity
import dev.fluttercommunity.workmanager.WorkmanagerDebug
import dev.fluttercommunity.workmanager.LoggingDebugHandler

class MainActivity: FlutterActivity() {
    override fun onStart() {
        super.onStart();
        WorkmanagerDebug.setCurrent(LoggingDebugHandler())
    }
}
