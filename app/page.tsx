import type { Metadata } from "next";
import LumosHealthApp from "./LumosHealthApp";

export const metadata: Metadata = {
  title: "Atendimento | Lumos Health",
  description:
    "Prontuário clínico que organiza a consulta enquanto o profissional cuida do paciente.",
};

export default function Home() {
  return <LumosHealthApp />;
}
