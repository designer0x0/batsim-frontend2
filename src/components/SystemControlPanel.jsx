import React from "react";
import "./SystemControlPanel.css";

function SystemControlPanel({ onClose, connected, resetSimulation }) {
  return (
    <div className="system-panel">
      <div className="system-panel-header">
        {console.log("Find!!!", onClose)}
        <h3>系統控制</h3>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="system-panel-content">
        <div className="divider"></div> {/* White line divider */}
        <div
          className="reset-simulation"
          onClick={resetSimulation}
        >
          重置模擬
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px" }}>
          連線狀態: {connected ? "🟢 已連線" : "🔴 未連線"}
        </div>
      </div>
    </div>
  );
}

export default SystemControlPanel;
