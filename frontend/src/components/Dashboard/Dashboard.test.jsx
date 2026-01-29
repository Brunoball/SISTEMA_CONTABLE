import React from "react";
import { describe, test, expect } from "vitest";
import { renderWithRouter } from "../../test-utils";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  test("renderiza sin errores", () => {
    renderWithRouter(<Dashboard />);
    expect(document.body).toBeInTheDocument();
  });
});
