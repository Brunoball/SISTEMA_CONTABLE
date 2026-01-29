import { render } from "@testing-library/react";
import Analisis_Financiero from "./Analisis_Financiero";

describe("Análisis Financiero", () => {
  test("renderiza sin romper", () => {
    render(<Analisis_Financiero />);
    expect(document.body).toBeInTheDocument();
  });
});
