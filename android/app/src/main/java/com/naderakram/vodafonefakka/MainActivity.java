package com.naderakram.vodafonefakka;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        registerPlugin(VodafoneDetectorPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(PrintPlugin.class);
    }
}

