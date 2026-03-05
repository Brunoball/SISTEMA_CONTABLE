// src/context/DateRangeContext.jsx
import React, { createContext, useContext, useState } from "react";

function defaultRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

const DateRangeContext = createContext(null);

export function DateRangeProvider({ children }) {
  const [dateRange, setDateRange] = useState(defaultRange);
  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange debe usarse dentro de DateRangeProvider");
  return ctx;
}