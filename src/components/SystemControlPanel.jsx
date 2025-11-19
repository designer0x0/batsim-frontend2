import React from "react";
import "./SystemControlPanel.css";

// 1. Receive the new props 'isCurrentOn' and 'toggleOceanCurrent' here (鑒)
function SystemControlPanel({
  onClose,
  connected,
  resetSimulation,
  ships = [],
  trackedShip,
  setTrackedShip,
}) {
  return (
    <div className="system-panel">
      <div className="system-panel-header">
        {/* I removed the 'Find!!!' console.log (屑) */}
        <h3>系統控制</h3>
        <button className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="system-panel-content">
        {/* 追蹤選單 */}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>視角追蹤</label>
          <select
            value={trackedShip || ""}
            onChange={(e) => setTrackedShip && setTrackedShip(e.target.value || "")}
            style={{ width: "100%" }}
          >
            <option value="">全域</option>
            {ships.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
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