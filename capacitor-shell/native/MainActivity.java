/* ============================================================================
   AUBS Android shell — MainActivity (Phase 1)

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   Two jobs:
     1. Register the AubsNative plugin so the WebView can reach it as
        window.Capacitor.Plugins.AubsNative.
     2. Alias that plugin to window.AUBSNative — the exact global the merged provider
        seam (core/kernel/native-bridge.js) detects — and RE-INJECT it on every page
        load so it survives the navigation from index.html to aubs-app.html.

   The injected alias is the same contract as capacitor-shell/www/aubs-native-facade.js,
   inlined here so injection needs no asset read. This shell-only code is never on Pages.

   Location in the generated project (after `npx cap add android`):
     android/app/src/main/java/com/thegoodneighborguard/aubs/MainActivity.java
   ========================================================================== */
package com.thegoodneighborguard.aubs;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register BEFORE super.onCreate so the plugin is available to the first page load.
        registerPlugin(AubsNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Re-inject the alias whenever a page finishes loading (survives index→app navigation).
        final WebView webView = getBridge().getWebView();
        webView.setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);   // keep Capacitor's own bridge wiring intact
                view.evaluateJavascript(FACADE_JS, null);
            }
        });
    }

    // window.AUBSNative alias → the AubsNative plugin. Sync available()/info() are served from a
    // cache refreshed in the background; generate() forwards the governed ctx to the plugin.
    private static final String FACADE_JS =
        "(function(){try{" +
        "  var cap=window.Capacitor; var p=cap&&cap.Plugins?cap.Plugins.AubsNative:null; if(!p) return;" +
        "  var cache={available:true, info:{runtime:'capacitor-native-stub', model_id:'native-stub'}};" +
        "  try{ if(p.available) Promise.resolve(p.available()).then(function(r){ cache.available=(r&&typeof r==='object'&&'available' in r)?r.available===true:(r===true); }); }catch(e){}" +
        "  try{ if(p.info) Promise.resolve(p.info()).then(function(i){ if(i&&typeof i==='object') cache.info={runtime:i.runtime||cache.info.runtime, model_id:i.model_id||cache.info.model_id}; }); }catch(e){}" +
        "  window.AUBSNative={" +
        "    available:function(){ return cache.available===true; }," +
        "    health:function(){ if(!p.health) return Promise.resolve({ok:cache.available===true}); return Promise.resolve(p.health()).then(function(h){return {ok:!!(h&&h.ok===true)};}).catch(function(){return {ok:false};}); }," +
        "    info:function(){ return {runtime:cache.info.runtime, model_id:cache.info.model_id}; }," +
        "    generate:function(ctx){ ctx=ctx||{}; var req={messages:ctx.messages||(ctx.intent&&ctx.intent.messages)||[], contract:ctx.execution_contract||null, options:ctx.options||{}}; return Promise.resolve(p.generate(req)); }" +
        "  };" +
        "}catch(e){}})();";
}
