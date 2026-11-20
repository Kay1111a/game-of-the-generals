package io.github.kay1111a.salpakan;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
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

    private Rect visibleButton(ActivityScenario<GameActivity> app, String label, String selector) throws Exception {
        long until=SystemClock.uptimeMillis()+4000;
        do {
            AccessibilityNodeInfo root=device.getUiAutomation().getRootInActiveWindow();
            if (root!=null) {
                for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(label)) {
                    if (node.isVisibleToUser() && node.isClickable()) {
                        Rect rect=new Rect();
                        node.getBoundsInScreen(rect);
                        if (!rect.isEmpty()) return rect;
                    }
                }
            }
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis()<until);
        // Some WebView providers omit virtual nodes from an accessibility text search.
        // Use the rendered button's center for the same OS-level tap on those providers.
        JSONArray point=new JSONArray(js(app,"(()=>{const r=document.querySelector("+JSONObject.quote(selector)+").getBoundingClientRect();return [(r.left+r.width/2)/innerWidth,(r.top+r.height/2)/innerWidth];})()"));
        double x=point.getDouble(0), y=point.getDouble(1);
        Rect rect=new Rect();
        app.onActivity(a -> {
            WebView view=a.findViewById(R.id.game_board);
            int[] loc=new int[2]; view.getLocationOnScreen(loc);
            int left=loc[0]+(int)(x*view.getWidth()), top=loc[1]+(int)(y*view.getWidth());
            rect.set(left,top,left+1,top+1);
        });
        return rect;
    }

    private void tap(ActivityScenario<GameActivity> app, String label, String selector) throws Exception {
        Rect button=visibleButton(app,label,selector);
        long at=SystemClock.uptimeMillis();
        for (int kind : new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}) {
            MotionEvent e=MotionEvent.obtain(at,SystemClock.uptimeMillis(),kind,button.exactCenterX(),button.exactCenterY(),0);
            e.setSource(InputDevice.SOURCE_TOUCHSCREEN); device.sendPointerSync(e); e.recycle();
            if (kind==MotionEvent.ACTION_DOWN) SystemClock.sleep(75);
        }
    }

    @Test public void playOfflineOnInstalledApk() throws Exception {
        assertEquals(PackageManager.PERMISSION_DENIED, device.getTargetContext().checkSelfPermission(android.Manifest.permission.INTERNET));
        try (ActivityScenario<GameActivity> app = ActivityScenario.launch(GameActivity.class)) {
            String modes="!!document.querySelector('#settings[open] #mode-step:not([hidden])')";
            String levels="!!document.querySelector('#settings[open] #difficulty-step:not([hidden])')";
            String cells="document.querySelectorAll('[data-cell]').length";
            awaitJs(app,modes,"true");
            awaitJs(app,cells,"0");
            // DOM readiness can precede the first composited frame on a cold emulator.
            CompletableFuture<Boolean> painted=new CompletableFuture<>();
            app.onActivity(a -> ((WebView)a.findViewById(R.id.game_board)).postVisualStateCallback(1,
                new WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) { painted.complete(true); }
                }));
            painted.get(15,TimeUnit.SECONDS);
            tap(app,"Player vs AI","#mode-ai");
            awaitJs(app,levels,"true");
            awaitJs(app,cells,"0");
            device.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            awaitJs(app,modes,"true");
            awaitJs(app,cells,"0");
            tap(app,"Player vs AI","#mode-ai");
            awaitJs(app,levels,"true");
            tap(app,"Hard","[data-difficulty='hard']");
            awaitJs(app,"document.querySelector('#mode-label').textContent",JSONObject.quote("Vs computer · Hard"));
            awaitJs(app,cells,"72");
            app.recreate();
            awaitJs(app,modes,"true");
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
