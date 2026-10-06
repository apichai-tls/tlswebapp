import { redirect } from "next/navigation";

export default function FeeCalculatorRoute() {
  redirect("/admin?tab=calculator");
}
