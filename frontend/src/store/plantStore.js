// Global state store — centralised app-level state
// Uses React Context so any component can read plant data
// without prop drilling

import React, { createContext, useContext, useState, useCallback } from "react";

const PlantContext = createContext(null);

export function PlantProvider({ children }) {
  const [selectedPlant,     setSelectedPlant]     = useState("ALL");
  const [selectedEquipment, setSelectedEquipment] = useState("ALL");
  const [alertsAcknowledged, setAlertsAcknowledged] = useState([]);
  const [theme,             setTheme]             = useState("light");

  const acknowledgeAlert = useCallback((id) => {
    setAlertsAcknowledged(prev => [...prev, id]);
  }, []);

  return (
    <PlantContext.Provider value={{
      selectedPlant,     setSelectedPlant,
      selectedEquipment, setSelectedEquipment,
      alertsAcknowledged, acknowledgeAlert,
      theme, setTheme,
    }}>
      {children}
    </PlantContext.Provider>
  );
}

export function usePlantStore() {
  const ctx = useContext(PlantContext);
  if (!ctx) throw new Error("usePlantStore must be used inside <PlantProvider>");
  return ctx;
}