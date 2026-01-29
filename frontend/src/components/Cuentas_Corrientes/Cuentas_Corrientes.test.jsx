import { render } from "@testing-library/react";
import Cuentas_Corrientes from "./Cuentas_Corrientes";

describe("Cuentas Corrientes", () => {
  test("renderiza correctamente", () => {
    render(<Cuentas_Corrientes />);
    expect(document.body).toBeInTheDocument();
  });
});
