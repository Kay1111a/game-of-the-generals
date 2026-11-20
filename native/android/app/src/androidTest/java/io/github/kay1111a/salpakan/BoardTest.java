package io.github.kay1111a.salpakan;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BoardTest {
    private final Instrumentation device = InstrumentationRegistry.getInstrumentation();

    private String js(ActivityScenario<GameActivity> app, String code) throws Exception {
        CompletableFuture<String> reply = new CompletableFuture<>();
        app.onActivity(a -> ((WebView)a.findViewById(R.id.game_board)).evaluateJavascript(code, reply::complete));
        return reply.get(10, TimeUnit.SECONDS);
    }

    @Test public void playOfflineOnInstalledApk() throws Exception {
        assertEquals(PackageManager.PERMISSION_DENIED, device.getTargetContext().checkSelfPermission(android.Manifest.permission.INTERNET));
        try (ActivityScenario<GameActivity> app = ActivityScenario.launch(GameActivity.class)) {
            long deadline = SystemClock.uptimeMillis() + 30000;
            while (!"72".equals(js(app,"document.querySelectorAll('[data-cell]').length")) && SystemClock.uptimeMillis() < deadline)
                SystemClock.sleep(150);
            assertEquals("72", js(app,"document.querySelectorAll('[data-cell]').length"));
            // Perform one real touchscreen tap and send Android Back before the DOM playthroughs.
            JSONArray point = new JSONArray(js(app,"(()=>{const r=document.querySelector('#new-top').getBoundingClientRect();return [(r.left+r.width/2)/innerWidth,(r.top+r.height/2)/innerWidth];})()"));
            double x = point.getDouble(0), y = point.getDouble(1);
            float[] position = new float[2];
            app.onActivity(a -> {
                WebView v=a.findViewById(R.id.game_board);
                int[] loc = new int[2]; v.getLocationOnScreen(loc);
                position[0]=(float)(loc[0]+x*v.getWidth()); position[1]=(float)(loc[1]+y*v.getWidth());
            });
            long at=SystemClock.uptimeMillis();
            for (int kind : new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}) {
                MotionEvent e=MotionEvent.obtain(at,SystemClock.uptimeMillis(),kind,position[0],position[1],0);
                e.setSource(InputDevice.SOURCE_TOUCHSCREEN); device.sendPointerSync(e); e.recycle(); SystemClock.sleep(50);
            }
            assertEquals("true", js(app,"document.querySelector('#settings').open"));
            device.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            for (int i=0; i<30 && "true".equals(js(app,"document.querySelector('#settings').open")); i++) SystemClock.sleep(100);
            assertEquals("false", js(app,"document.querySelector('#settings').open"));
            try (InputStream input=device.getContext().getAssets().open("play.js")) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buf=new byte[4096]; int n;
                while ((n=input.read(buf))!=-1) bytes.write(buf,0,n);
                js(app,new String(bytes.toByteArray(), StandardCharsets.UTF_8)+"\nplayNativeMatches(); void 0;");
            }
            deadline=SystemClock.uptimeMillis()+420000;
            while (SystemClock.uptimeMillis()<deadline) {
                JSONObject info=new JSONObject(js(app,"window.nativePlaytest || {}"));
                if (info.has("error")) fail(info.getString("error"));
                if (info.optBoolean("done")) {
                    assertEquals(4,info.getJSONArray("matches").length());
                    Log.i("SalpakanQA",info.getJSONArray("matches").toString());
                    return;
                }
                SystemClock.sleep(350);
            }
            fail("Timed out: "+js(app,"window.nativePlaytest"));
        }
    }
}
