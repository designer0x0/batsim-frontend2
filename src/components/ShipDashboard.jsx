import React from "react";
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

        <div style={{ maxHeight: "320px", overflowY: "auto" }}>
          {ships.map((ship) => (
            <label key={ship.name} style={{ display: "block", marginBottom: "6px" }}>
              <input
                type="checkbox"
                checked={selected.includes(ship.name)}
                onChange={() => toggle(ship.name)}
                style={{ marginRight: "8px" }}
              />
              {ship.name}
              {shipHistories[ship.name] && shipHistories[ship.name].length > 0 && (
                <span style={{ marginLeft: "8px", color: "#999", fontSize: "12px" }}>
                  ({shipHistories[ship.name].length} pts)
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="divider"></div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          打勾以顯示該船自啟動後的移動軌跡。
        </div>
      </div>
    </div>
  );
}

export default ShipDashboard;
