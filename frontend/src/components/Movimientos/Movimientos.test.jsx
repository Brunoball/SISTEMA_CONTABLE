import { render } from "@testing-library/react";
import Movimientos from "./Movimientos";

describe("Movimientos", () => {
  test("se renderiza correctamente", () => {
    render(<Movimientos />);
    expect(document.body).toBeInTheDocument();
  });
});
