// tools/build_flare_template.js: Assemble web/flare.src.html with VCVBridge 4 HP SVG faceplate
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const svgPath = '/Users/vmaurer/Music/Workshop_Computer_VCV_Bridge/plugin/res/VCVBridge.svg';

if (!fs.existsSync(svgPath)) {
  console.error("Error: VCVBridge.svg not found at " + svgPath);
  process.exit(1);
}

const bridgeSvg = fs.readFileSync(svgPath, 'utf8')
  .replace(/<\?xml[^>]*\?>/g, '') // remove xml header
  .replace(/<!DOCTYPE[^>]*>/g, '') // remove doctype
  .trim();

const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>'(flare) · visual patcher</title>
  <link rel="icon" href="lens-logo.svg">
  <link rel="stylesheet" href="flare.css">
</head>
<body>

  <!-- Topbar Header -->
  <header class="topbar">
    <div class="brand">'(flare) <span>visual patcher</span></div>
    <div id="status">initializing compiler...</div>
  </header>

  <!-- Toolbar Controls -->
  <div class="toolbar">
    <div style="position: relative; display: inline-block;">
      <button id="addModuleBtn">Add Module +</button>
      <!-- Compact Dropdown popover list -->
      <div class="module-dropdown" id="moduleDropdown">
        <input type="text" id="moduleSearch" placeholder="Search operators..." autocomplete="off">
        <div class="dropdown-items" id="dropdownItems"></div>
      </div>
    </div>
    
    <button id="connectMidiBtn">Connect MIDI</button>
    <button id="sendBtn" disabled>Send to Card</button>
    <button id="saveCardBtn" disabled>Save to Flash</button>
    <button id="clearBtn">Clear Rack</button>
    <button id="exportCodeBtn">Download Code</button>
  </div>

  <!-- Main Split-Screen Workspace -->
  <div class="split-view">
    
    <!-- Left: Visual Rack Patcher -->
    <div class="visual-pane">
      <div class="workspace" id="workspace">
        <div class="rack-frame">
          <div class="rack-rails top"></div>
          <div class="rack" id="rack">
            
            <!-- SVG Cable Layer -->
            <svg class="cable-svg" id="cableLayer">
              <!-- Dynamic and temporary patch cables render here -->
            </svg>

            <!-- Fixed Module: VCVBridge IO Module (90px wide, 6 HP) -->
            <div class="module computer-card" id="module-hardware" style="width: 90px; height: 570px; padding: 0; border: none; overflow: hidden; background: none;">
              <div class="faceplate-svg-container" style="position: relative; width: 100%; height: 100%;">
                ${bridgeSvg}

                <!-- Sockets Row 1: Knobs Main, X outputs (top = 13.16%) -->
                <div class="jack" id="hw-knob-main-out" data-port="knob-main" data-type="output" style="left: 25.0%; top: 13.16%;" title="knob-main output"></div>
                <div class="jack" id="hw-knob-x-out" data-port="knob-x" data-type="output" style="left: 75.0%; top: 13.16%;" title="knob-x output"></div>

                <!-- Sockets Row 2: Knob Y, Switch outputs (top = 22.63%) -->
                <div class="jack" id="hw-knob-y-out" data-port="knob-y" data-type="output" style="left: 25.0%; top: 22.63%;" title="knob-y output"></div>
                <div class="jack" id="hw-switch-z-out" data-port="switch-z" data-type="output" style="left: 75.0%; top: 22.63%;" title="switch-z output"></div>

                <!-- Sockets Row 3: Inputs Audio 1, 2 (top = 32.11%) -->
                <div class="jack" id="hw-audio-in-1" data-port="audio-in-1" data-type="output" style="left: 25.0%; top: 32.11%;" title="audio-in 1"></div>
                <div class="jack" id="hw-audio-in-2" data-port="audio-in-2" data-type="output" style="left: 75.0%; top: 32.11%;" title="audio-in 2"></div>

                <!-- Sockets Row 4: Inputs CV 1, 2 (top = 41.58%) -->
                <div class="jack" id="hw-cv-in-1" data-port="cv-in-1" data-type="output" style="left: 25.0%; top: 41.58%;" title="cv-in 1"></div>
                <div class="jack" id="hw-cv-in-2" data-port="cv-in-2" data-type="output" style="left: 75.0%; top: 41.58%;" title="cv-in 2"></div>

                <!-- Sockets Row 5: Inputs Pulse 1, 2 (top = 51.05%) -->
                <div class="jack" id="hw-pulse-in-1" data-port="pulse-in-1" data-type="output" style="left: 25.0%; top: 51.05%;" title="pulse-in 1"></div>
                <div class="jack" id="hw-pulse-in-2" data-port="pulse-in-2" data-type="output" style="left: 75.0%; top: 51.05%;" title="pulse-in 2"></div>

                <!-- Sockets Row 6: Outputs Audio 1, 2 (top = 60.53%) -->
                <div class="jack" id="hw-audio-out-1" data-port="audio-out-1" data-type="input" style="left: 25.0%; top: 60.53%;" title="audio-out 1"></div>
                <div class="jack" id="hw-audio-out-2" data-port="audio-out-2" data-type="input" style="left: 75.0%; top: 60.53%;" title="audio-out 2"></div>

                <!-- Sockets Row 7: Outputs CV 1, 2 (top = 70.00%) -->
                <div class="jack" id="hw-cv-out-1" data-port="cv-out-1" data-type="input" style="left: 25.0%; top: 70.00%;" title="cv-out 1"></div>
                <div class="jack" id="hw-cv-out-2" data-port="cv-out-2" data-type="input" style="left: 75.0%; top: 70.00%;" title="cv-out 2"></div>

                <!-- Sockets Row 8: Outputs Pulse 1, 2 (top = 79.47%) -->
                <div class="jack" id="hw-pulse-out-1" data-port="pulse-out-1" data-type="input" style="left: 25.0%; top: 79.47%;" title="pulse-out 1"></div>
                <div class="jack" id="hw-pulse-out-2" data-port="pulse-out-2" data-type="input" style="left: 75.0%; top: 79.47%;" title="pulse-out 2"></div>

                <!-- LEDs Overlay Glow (Mapped to 6 hardware LEDs) -->
                <!-- Column 1: left = 14% -->
                <div class="led-light" id="led-0" style="left: 14.0%; top: 85.5%; width: 5px; height: 5px;"></div>
                <div class="led-light" id="led-2" style="left: 14.0%; top: 88.9%; width: 5px; height: 5px;"></div>
                <div class="led-light" id="led-4" style="left: 14.0%; top: 92.4%; width: 5px; height: 5px;"></div>
                <!-- Column 2: left = 36% -->
                <div class="led-light" id="led-1" style="left: 36.0%; top: 85.5%; width: 5px; height: 5px;"></div>
                <div class="led-light" id="led-3" style="left: 36.0%; top: 88.9%; width: 5px; height: 5px;"></div>
                <div class="led-light" id="led-5" style="left: 36.0%; top: 92.4%; width: 5px; height: 5px;"></div>
              </div>
            </div>

            <!-- Virtual Modules will mount dynamically here -->

          </div>
          <div class="rack-rails bottom"></div>
        </div>
      </div>
    </div>

    <!-- Right: Real-time Generated Code Panel -->
    <div class="code-pane">
      <div class="code-pane-header">Generated Loupe Code</div>
      <textarea class="code-area" id="codeArea" readonly placeholder="Wire up modules to generate code..."></textarea>
    </div>

  </div>

</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'web', 'flare.src.html'), htmlContent);
console.log("Assembled web/flare.src.html with VCVBridge 4 HP SVG faceplate!");
