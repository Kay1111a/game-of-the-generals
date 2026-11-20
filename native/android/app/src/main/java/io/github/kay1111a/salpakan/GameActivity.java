package io.github.kay1111a.salpakan;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.FrameLayout;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class GameActivity extends Activity {
    private WebView game;
    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(25, 60, 54));
        // Android 15 lays out edge-to-edge. Keep the board and buttons inside the system bars.
        if (Build.VERSION.SDK_INT >= 35) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(frame);
        PackageInfo engine = WebView.getCurrentWebViewPackage();
        if (engine == null || majorVersion(engine.versionName) < 105) {
            problem("Update Android System WebView or Chrome on this device, then open Salpakan again.");
            return;
        }
        game = new WebView(this);
        game.setId(R.id.game_board);
        frame.addView(game, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        try (InputStream input = getAssets().open("Salpakan.html")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) out.write(buffer, 0, count);
            String base = "https://salpakan.invalid/";
            game.loadDataWithBaseURL(base, new String(out.toByteArray(), StandardCharsets.UTF_8), "text/html", "UTF-8", base);
        } catch (IOException error) {
            problem("The installed game data could not be read. Reinstall Salpakan to restore it.");
        }
    }

    private static int majorVersion(String version) {
        if (version == null) return 0;
        try { return Integer.parseInt(version.split("\\.", 2)[0]); }
        catch (NumberFormatException error) { return 0; }
    }

    private void problem(String text) {
        new AlertDialog.Builder(this).setTitle("Salpakan").setMessage(text)
            .setPositiveButton("Close", (d, w) -> finish()).setOnCancelListener(d -> finish()).show();
    }

    @Override public void onBackPressed() {
        if (game == null) { super.onBackPressed(); return; }
        String back = "(()=>{const d=document.querySelector('dialog[open]');"
            + "if(!d || (d.id==='settings' && document.body.hasAttribute('data-launch') && !document.getElementById('mode-step').hidden)) return false;"
            + "if(d.dispatchEvent(new Event('cancel',{cancelable:true}))) d.close();return true;})()";
        game.evaluateJavascript(back, handled -> {
            if (!"true".equals(handled) && !isFinishing()) {
                new AlertDialog.Builder(this).setTitle("Close Salpakan?").setMessage("Any match in progress will end.")
                    .setNegativeButton("Keep playing", null).setPositiveButton("Exit", (d,w) -> finish()).show();
            }
        });
    }

    @Override public void onDestroy() {
        if (game != null) {
            ((FrameLayout) game.getParent()).removeView(game);
            game.destroy();
        }
        super.onDestroy();
    }
}
