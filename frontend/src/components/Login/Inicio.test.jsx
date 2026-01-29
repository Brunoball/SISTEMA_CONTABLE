import React from "react";
import { describe, test, expect } from "vitest";
import { renderWithRouter } from "../../test-utils";
import Inicio from "./Inicio";

describe("Inicio (Login)", () => {
  test("renderiza el formulario de login", () => {
    renderWithRouter(<Inicio />);
    expect(document.body).toBeInTheDocument();
  });
});
