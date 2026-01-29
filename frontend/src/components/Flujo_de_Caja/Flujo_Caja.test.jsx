import { render } from "@testing-library/react";
import Flujo_Caja from "./Flujo_Caja";

describe("Flujo de Caja", () => {
  test("renderiza sin romper", () => {
    render(<Flujo_Caja />);
    expect(document.body).toBeInTheDocument();
  });
});
