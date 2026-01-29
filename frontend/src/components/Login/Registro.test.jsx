import React from "react";
import { describe, test, expect } from "vitest";
import { renderWithRouter } from "../../test-utils";
import Registro from "./Registro";

describe("Registro", () => {
  test("renderiza el formulario de registro", () => {
    renderWithRouter(<Registro />);
    expect(document.body).toBeInTheDocument();
  });
});
