package io.github.kay1111a.snakesladders;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.pm.PackageManager;
import android.graphics.Point;
import android.graphics.Rect;
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

    private void awaitJs(ActivityScenario<GameActivity> app, String query, String expected) throws Exception {
        long until=SystemClock.uptimeMillis()+10000;
        String last;
        do {
            last=js(app,query);
            if (expected.equals(last)) return;
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis()<until);
        assertEquals(query, expected, last);
    }

    private Point buttonCenter(ActivityScenario<GameActivity> app, String selector) throws Exception {
        String hitTest = "(()=>{const button=document.querySelector("+JSONObject.quote(selector)+");"
            + "if(!button || !button.getClientRects().length) return null;"
            + "const r=button.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;"
            + "if(!button.contains(document.elementFromPoint(x,y))) return null;"
            + "return [x/innerWidth,y/innerHeight];})()";
        long until=SystemClock.uptimeMillis()+30000;
        do {
            Rect webBounds=new Rect();
            app.onActivity(a -> {
                WebView view=a.findViewById(R.id.game_board);
                if (!a.hasWindowFocus() || !view.isShown() || view.getWidth()==0 || view.getHeight()==0) return;
                int[] origin=new int[2];
                view.getLocationOnScreen(origin);
                webBounds.set(origin[0],origin[1],origin[0]+view.getWidth(),origin[1]+view.getHeight());
            });
            if (!webBounds.isEmpty()) {
                String result=js(app,hitTest);
                if (result!=null && !result.equals("null")) {
                    JSONArray center=new JSONArray(result);
                    int x=webBounds.left+(int)(center.getDouble(0)*webBounds.width());
                    int y=webBounds.top+(int)(center.getDouble(1)*webBounds.height());
                    if (webBounds.contains(x,y)) return new Point(x,y);
                }
            }
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis()<until);
        throw new AssertionError("No visible, tappable "+selector+" in the focused game window");
    }

    private void tap(ActivityScenario<GameActivity> app, String selector) throws Exception {
        device.waitForIdleSync();
        Point point=buttonCenter(app,selector);
        long at=SystemClock.uptimeMillis();
        for (int kind : new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}) {
            MotionEvent e=MotionEvent.obtain(at,SystemClock.uptimeMillis(),kind,point.x,point.y,0);
            e.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try {
                assertTrue("Android did not deliver the tap on "+selector, device.getUiAutomation().injectInputEvent(e,true));
            } finally {
                e.recycle();
            }
            if (kind==MotionEvent.ACTION_DOWN) SystemClock.sleep(75);
        }
    }

    @Test public void playOfflineOnInstalledApk() throws Exception {
        assertEquals(PackageManager.PERMISSION_DENIED, device.getTargetContext().checkSelfPermission(android.Manifest.permission.INTERNET));
        try (ActivityScenario<GameActivity> app = ActivityScenario.launch(GameActivity.class)) {
            awaitJs(app,"!!document.querySelector('#picker[open] #choices button')","true");
            tap(app,"#choices button");
            awaitJs(app,"document.getElementById('heading').textContent",JSONObject.quote("Choose AI difficulty"));
            device.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            awaitJs(app,"document.getElementById('heading').textContent",JSONObject.quote("Choose a game"));
            try (InputStream input=device.getContext().getAssets().open("play.js")) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buf=new byte[4096]; int n;
                while ((n=input.read(buf))!=-1) bytes.write(buf,0,n);
                js(app,new String(bytes.toByteArray(), StandardCharsets.UTF_8)+"\nplayNativeMatches(); void 0;");
            }
            long deadline=SystemClock.uptimeMillis()+420000;
            while (SystemClock.uptimeMillis()<deadline) {
                JSONObject info=new JSONObject(js(app,"window.nativePlaytest || {}"));
                if (info.has("error")) fail(info.getString("error"));
                if (info.optBoolean("done")) {
                    assertEquals(6,info.getJSONArray("matches").length());
                    Log.i("SnakesAndLaddersQA",info.getJSONArray("matches").toString());
                    return;
                }
                SystemClock.sleep(350);
            }
            fail("Timed out: "+js(app,"window.nativePlaytest"));
        }
    }
}
