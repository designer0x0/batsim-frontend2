import React from "react";
import { unityToLatLon } from "../utils/conversions";
import "./SystemControlPanel.css";

function ShipDashboard({ onClose, ships = [], selected = [], setSelected = () => {}, shipHistories = {} }) {
  const toggle = (name) => {
    if (selected.includes(name)) {
      setSelected(selected.filter((s) => s !== name));
    } else {
      setSelected([...selected, name]);
    }
  };

  return (
    <div className="system-panel">
      <div className="system-panel-header">
        <h3>船隻儀錶板</h3>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="system-panel-content">
        <div className="divider"></div>

        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {ships.map((ship) => {
            // Convert Unity coordinates to lat/lon
            const { lat, lon } = unityToLatLon(ship.position.x, ship.position.z);
            const historyLength = shipHistories[ship.name]?.length || 0;
            const status = ship.isWaiting ? "等待中" : "航行中";

            return (
              <div key={ship.name} className="ship-item">
                {/* Ship name */}
                <div className="ship-name">{ship.name}</div>

                {/* Status */}
                <div className="ship-info">
                  狀態: <span className={`ship-status ${ship.isWaiting ? "status-waiting" : "status-active"}`}>
                    {status}
                  </span>
                </div>

                {/* Coordinates */}
                <div className="ship-info">
                  緯度: {lat.toFixed(4)}, 經度: {lon.toFixed(4)}
                </div>

                {/* Path checkbox */}
                <label className="ship-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selected.includes(ship.name)}
                    onChange={() => toggle(ship.name)}
                  />
                  <span>顯示移動軌跡</span>
                  {historyLength > 0 && (
                    <span className="ship-info" style={{ marginLeft: "6px" }}>
                      ({historyLength} pts)
                    </span>
                  )}
                </label>
              </div>
            );
          })}
        </div>

        <div className="divider"></div>
        <div style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
          勾選以顯示該船隻自啟動後的移動軌跡。
        </div>
      </div>
    </div>
  );
}

export default ShipDashboard;
