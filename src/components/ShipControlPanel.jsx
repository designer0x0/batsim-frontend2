import React from "react";
import "./SystemControlPanel.css"; // 直接沿用同一份 CSS

function ShipControlPanel({
  onClose,
  ships,
  selectedShipCommand,
  setSelectedShipCommand,
  sendShipCommand
}) {
  return (
    <div className="system-panel">
      <div className="system-panel-header">
        <h3>船隻控制</h3>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="system-panel-content">

        <div className="divider"></div>

        <div style={{ marginBottom: "10px" }}>
          <select
            value={selectedShipCommand}
            onChange={(e) => setSelectedShipCommand(e.target.value)}
          >
            {ships.map((ship) => (
              <option key={ship.name} value={ship.name}>
                {ship.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="reset-simulation"
          onClick={() => sendShipCommand("start", selectedShipCommand)}
        >
          啟動
        </button>

        <button
          className="stop-button"
          onClick={() => sendShipCommand("stop", selectedShipCommand)}
        >
          停止
        </button>
      </div>
    </div>
  );
}

export default ShipControlPanel;
